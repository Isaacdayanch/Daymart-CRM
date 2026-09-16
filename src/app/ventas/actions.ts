"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { texto } from "@/lib/form-helpers";
import { completarColumnasOmitidas, insertarMovimientosStock } from "@/lib/movimientos-stock";
import { costoPromedioPonderado, stockActual } from "@/lib/calculos-stock";
import { saldoVenta } from "@/lib/calculos-ventas";
import type { CobroVenta, FormaPagoVenta, MovimientoStock, Venta, VentaLinea } from "@/lib/tipos";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const CATEGORIA_VENTAS = "Ventas directas";

function fechaDesdeFormulario(valor: FormDataEntryValue | null) {
  return typeof valor === "string" && valor ? new Date(`${valor}T12:00:00`).toISOString() : new Date().toISOString();
}

function refrescarVentas() {
  revalidatePath("/ventas");
  revalidatePath("/ventas/por-cobrar");
  revalidatePath("/ventas/clientes");
  revalidatePath("/finanzas");
  revalidatePath("/finanzas/movimientos");
  revalidatePath("/finanzas/balance");
  revalidatePath("/stock");
  revalidatePath("/stock/movimientos");
  revalidatePath("/");
}

async function categoriaVentasId(supabase: Supabase) {
  const { data } = await supabase
    .from("categorias_financieras")
    .select("id")
    .eq("nombre", CATEGORIA_VENTAS)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

// ---------- Clientes ----------

export async function crearCliente(formData: FormData) {
  const supabase = await createClient();
  const nombre = texto(formData, "nombre");
  if (!nombre) return { error: "Falta el nombre del cliente." };
  const diasCredito = Number(formData.get("dias_credito"));

  const { error } = await supabase.from("clientes").insert({
    nombre,
    telefono: texto(formData, "telefono"),
    notas: texto(formData, "notas"),
    dias_credito: Number.isFinite(diasCredito) && diasCredito > 0 ? Math.round(diasCredito) : null,
  });
  if (error) return { error: error.message };

  refrescarVentas();
  return { error: null };
}

export async function actualizarCliente(clienteId: string, formData: FormData) {
  const supabase = await createClient();
  const nombre = texto(formData, "nombre");
  if (!nombre) return { error: "Falta el nombre del cliente." };
  const diasCredito = Number(formData.get("dias_credito"));

  const { error } = await supabase
    .from("clientes")
    .update({
      nombre,
      telefono: texto(formData, "telefono"),
      notas: texto(formData, "notas"),
      dias_credito: Number.isFinite(diasCredito) && diasCredito > 0 ? Math.round(diasCredito) : null,
    })
    .eq("id", clienteId);
  if (error) return { error: error.message };

  refrescarVentas();
  return { error: null };
}

/** Manda el cliente a "eliminado" (no se borra de verdad: sus ventas
 * pasadas lo siguen necesitando). Solo si no tiene ventas con saldo. */
export async function eliminarCliente(clienteId: string) {
  const supabase = await createClient();
  const { data: ventas } = await supabase.from("ventas").select("*").eq("cliente_id", clienteId).returns<Venta[]>();
  const ids = (ventas ?? []).map((v) => v.id);
  if (ids.length) {
    const [{ data: lineas }, { data: cobros }] = await Promise.all([
      supabase.from("venta_lineas").select("*").in("venta_id", ids).returns<VentaLinea[]>(),
      supabase.from("cobros_venta").select("*").in("venta_id", ids).returns<CobroVenta[]>(),
    ]);
    const conSaldo = (ventas ?? []).some(
      (v) =>
        saldoVenta(
          v,
          (lineas ?? []).filter((l) => l.venta_id === v.id),
          (cobros ?? []).filter((c) => c.venta_id === v.id),
        ) > 0.01,
    );
    if (conSaldo) return { error: "Este cliente todavía te debe dinero — cobra o cancela esas ventas antes de quitarlo." };
  }

  const { error } = await supabase.from("clientes").update({ eliminado_en: new Date().toISOString() }).eq("id", clienteId);
  if (error) return { error: error.message };
  refrescarVentas();
  return { error: null };
}

// ---------- Ventas ----------

interface LineaVentaEntrada {
  sku: string;
  nombre: string;
  imagenUrl: string | null;
  piezasPorCaja: number;
  cantidad: number;
  precioUnitario: number;
}

/** Registra una venta completa en una sola operación: la venta con sus
 * líneas, la SALIDA de stock de cada producto (ligada a la venta) y, si es
 * de contado, el cobro con su ENTRADA real en Finanzas. Si algo falla a
 * medio camino, se deshace lo que ya se había guardado — nunca queda una
 * venta "a medias" (mismo principio de todo o nada del resto del sistema). */
export async function registrarVenta(formData: FormData) {
  const supabase = await createClient();

  let clienteId = texto(formData, "cliente_id");
  const nuevoClienteNombre = texto(formData, "nuevo_cliente_nombre");
  const bodegaId = texto(formData, "bodega_id");
  const formaPago = texto(formData, "forma_pago") as FormaPagoVenta | null;
  const conIva = formData.get("con_iva") === "true";
  const cuentaId = texto(formData, "cuenta_id");
  const fechaLimiteCampo = formData.get("fecha_limite");
  const notas = texto(formData, "notas");
  const fecha = fechaDesdeFormulario(formData.get("fecha"));

  const lineasCrudo = formData.get("lineas");
  let lineas: LineaVentaEntrada[];
  try {
    lineas = typeof lineasCrudo === "string" ? JSON.parse(lineasCrudo) : [];
  } catch {
    return { error: "No se pudieron leer los productos de la venta." };
  }

  if (!clienteId && !nuevoClienteNombre) return { error: "Elige el cliente (o escribe el nombre de uno nuevo)." };
  if (!bodegaId) return { error: "Elige de qué bodega sale la mercancía." };
  if (formaPago !== "CONTADO" && formaPago !== "CREDITO") return { error: "Elige si es de contado o a crédito." };
  if (formaPago === "CONTADO" && !cuentaId) return { error: "Elige a qué cuenta entra el dinero." };
  if (!Array.isArray(lineas) || lineas.length === 0) return { error: "Agrega al menos un producto a la venta." };
  for (const l of lineas) {
    if (!l.sku || !(l.cantidad > 0)) return { error: "Hay una línea sin producto o con cantidad inválida." };
    if (!Number.isFinite(l.precioUnitario) || l.precioUnitario < 0) return { error: `El precio de ${l.nombre} no es válido.` };
  }

  // Stock disponible y costo promedio actual de cada SKU (para no vender
  // lo que no hay y para guardar el costo con el que se calcula el margen).
  const skus = Array.from(new Set(lineas.map((l) => l.sku)));
  const { data: movimientosSkus, error: errorMovs } = await supabase
    .from("movimientos_stock")
    .select("*")
    .in("sku", skus)
    .returns<MovimientoStock[]>();
  if (errorMovs) return { error: errorMovs.message };
  const costoPorSku = new Map<string, number>();
  for (const sku of skus) {
    const movs = (movimientosSkus ?? []).filter((m) => m.sku === sku);
    costoPorSku.set(sku, costoPromedioPonderado(movs));
    const disponible = stockActual(movs);
    const pedido = lineas.filter((l) => l.sku === sku).reduce((s, l) => s + l.cantidad, 0);
    if (pedido > disponible) {
      const nombre = lineas.find((l) => l.sku === sku)?.nombre ?? sku;
      return { error: `De "${nombre}" solo tienes ${disponible} en stock y quieres vender ${pedido}.` };
    }
  }

  let clienteNombre = nuevoClienteNombre ?? "";
  if (clienteId) {
    const { data: cliente } = await supabase.from("clientes").select("nombre").eq("id", clienteId).maybeSingle<{ nombre: string }>();
    if (!cliente) return { error: "No se encontró el cliente." };
    clienteNombre = cliente.nombre;
  } else {
    const { data: creado, error: errorCliente } = await supabase
      .from("clientes")
      .insert({ nombre: nuevoClienteNombre, telefono: texto(formData, "nuevo_cliente_telefono") })
      .select("id")
      .single<{ id: string }>();
    if (errorCliente || !creado) return { error: errorCliente?.message ?? "No se pudo crear el cliente." };
    clienteId = creado.id;
  }

  const fechaLimite =
    formaPago === "CREDITO" && typeof fechaLimiteCampo === "string" && fechaLimiteCampo
      ? new Date(`${fechaLimiteCampo}T12:00:00`).toISOString()
      : null;

  const { data: venta, error: errorVenta } = await supabase
    .from("ventas")
    .insert({
      cliente_id: clienteId,
      bodega_id: bodegaId,
      fecha,
      forma_pago: formaPago,
      con_iva: conIva,
      fecha_limite: fechaLimite,
      notas,
    })
    .select("id, numero")
    .single<{ id: string; numero: number }>();
  if (errorVenta || !venta) return { error: errorVenta?.message ?? "No se pudo guardar la venta." };

  async function deshacer(mensaje: string) {
    await supabase.from("movimientos_stock").delete().eq("venta_id", venta!.id);
    await supabase.from("ventas").delete().eq("id", venta!.id);
    return { error: mensaje };
  }

  const { error: errorLineas } = await supabase.from("venta_lineas").insert(
    lineas.map((l, i) => ({
      venta_id: venta.id,
      sku: l.sku,
      nombre: l.nombre,
      imagen_url: l.imagenUrl,
      cantidad: l.cantidad,
      precio_unitario: l.precioUnitario,
      costo_unitario: costoPorSku.get(l.sku) ?? 0,
      orden: i,
    })),
  );
  if (errorLineas) return deshacer(`No se pudieron guardar los productos: ${errorLineas.message}`);

  const salidas = lineas.map((l) => ({
    tipo: "SALIDA",
    sku: l.sku,
    nombre: l.nombre,
    bodega_id: bodegaId,
    cantidad: l.cantidad,
    piezas_por_caja: l.piezasPorCaja || 1,
    imagen_url: l.imagenUrl,
    costo_unitario_pesos: 0,
    destino: "Venta directa",
    referencia: `Venta #${venta.numero} — ${clienteNombre}`,
    venta_id: venta.id,
    creado_en: fecha,
  }));
  const { data: insertados, error: errorStock, columnasOmitidas } = await insertarMovimientosStock(supabase, salidas);
  if (errorStock) return deshacer(`No se pudo descontar el stock: ${errorStock}`);
  if (insertados && columnasOmitidas.length) {
    await completarColumnasOmitidas(supabase, insertados.map((i) => i.id), salidas, columnasOmitidas);
  }

  if (formaPago === "CONTADO") {
    const subtotal = lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);
    const total = conIva ? subtotal * 1.16 : subtotal;
    const resultado = await insertarCobro(supabase, {
      ventaId: venta.id,
      numero: venta.numero,
      clienteNombre,
      monto: total,
      fecha,
      cuentaId: cuentaId!,
      notas: "Pago de contado",
    });
    if (resultado.error) return deshacer(`Se guardó la venta pero no el cobro: ${resultado.error}`);
  }

  refrescarVentas();
  return { error: null, id: venta.id };
}

/** Borra una venta completa: sus salidas de stock (la mercancía "regresa"),
 * los movimientos de Finanzas de sus cobros, y la venta con sus líneas y
 * cobros. Para corregir una venta mal capturada. */
export async function eliminarVenta(ventaId: string) {
  const supabase = await createClient();
  const { data: cobros } = await supabase.from("cobros_venta").select("*").eq("venta_id", ventaId).returns<CobroVenta[]>();
  const idsMovimientos = (cobros ?? []).map((c) => c.movimiento_financiero_id).filter((id): id is string => Boolean(id));
  if (idsMovimientos.length) {
    const { error } = await supabase.from("movimientos_financieros").delete().in("id", idsMovimientos);
    if (error) return { error: `No se pudieron borrar los cobros en Finanzas: ${error.message}` };
  }
  const { error: errorStock } = await supabase.from("movimientos_stock").delete().eq("venta_id", ventaId);
  if (errorStock) return { error: `No se pudieron regresar los productos al stock: ${errorStock.message}` };
  const { error } = await supabase.from("ventas").delete().eq("id", ventaId);
  if (error) return { error: error.message };

  refrescarVentas();
  return { error: null };
}

// ---------- Cobros ----------

async function insertarCobro(
  supabase: Supabase,
  datos: { ventaId: string; numero: number; clienteNombre: string; monto: number; fecha: string; cuentaId: string; notas: string | null },
) {
  const { data: movimiento, error: errorMovimiento } = await supabase
    .from("movimientos_financieros")
    .insert({
      tipo: "ENTRADA",
      cuenta_id: datos.cuentaId,
      categoria_id: await categoriaVentasId(supabase),
      monto: datos.monto,
      moneda: "MXN",
      fecha: datos.fecha,
      contraparte: datos.clienteNombre,
      notas: datos.notas ?? `Venta #${datos.numero}`,
      referencia_tipo: "VENTA",
      referencia_id: datos.ventaId,
    })
    .select("id")
    .single<{ id: string }>();
  if (errorMovimiento || !movimiento) return { error: errorMovimiento?.message ?? "No se pudo guardar la entrada en Finanzas." };

  const { error: errorCobro } = await supabase.from("cobros_venta").insert({
    venta_id: datos.ventaId,
    monto: datos.monto,
    fecha: datos.fecha,
    cuenta_id: datos.cuentaId,
    notas: datos.notas,
    movimiento_financiero_id: movimiento.id,
  });
  if (errorCobro) {
    await supabase.from("movimientos_financieros").delete().eq("id", movimiento.id);
    return { error: errorCobro.message };
  }
  return { error: null };
}

async function cargarVenta(supabase: Supabase, ventaId: string) {
  const [{ data: venta }, { data: lineas }, { data: cobros }] = await Promise.all([
    supabase.from("ventas").select("*").eq("id", ventaId).maybeSingle<Venta>(),
    supabase.from("venta_lineas").select("*").eq("venta_id", ventaId).returns<VentaLinea[]>(),
    supabase.from("cobros_venta").select("*").eq("venta_id", ventaId).returns<CobroVenta[]>(),
  ]);
  if (!venta) return null;
  const { data: cliente } = await supabase.from("clientes").select("nombre").eq("id", venta.cliente_id).maybeSingle<{ nombre: string }>();
  return { venta, lineas: lineas ?? [], cobros: cobros ?? [], clienteNombre: cliente?.nombre ?? "Cliente" };
}

/** Registra un pago (parcial o total) de una venta a crédito. Genera su
 * ENTRADA real en Finanzas en la misma operación. */
export async function registrarCobro(ventaId: string, formData: FormData) {
  const supabase = await createClient();
  const monto = Number(formData.get("monto"));
  const cuentaId = texto(formData, "cuenta_id");
  if (!Number.isFinite(monto) || monto <= 0) return { error: "El monto no es válido." };
  if (!cuentaId) return { error: "Elige a qué cuenta entra el dinero." };

  const datos = await cargarVenta(supabase, ventaId);
  if (!datos) return { error: "No se encontró la venta." };
  const saldo = saldoVenta(datos.venta, datos.lineas, datos.cobros);
  if (monto > saldo + 0.01) {
    return { error: `El cliente solo debe ${saldo.toLocaleString("es-MX", { style: "currency", currency: "MXN" })} de esta venta.` };
  }

  const resultado = await insertarCobro(supabase, {
    ventaId,
    numero: datos.venta.numero,
    clienteNombre: datos.clienteNombre,
    monto,
    fecha: fechaDesdeFormulario(formData.get("fecha")),
    cuentaId,
    notas: texto(formData, "notas"),
  });
  if (resultado.error) return resultado;

  refrescarVentas();
  revalidatePath(`/ventas/${ventaId}`);
  return { error: null };
}

/** Corrige un cobro ya guardado (monto, fecha, cuenta, notas) y actualiza
 * en la misma operación su movimiento de Finanzas ligado. */
export async function actualizarCobro(cobroId: string, formData: FormData) {
  const supabase = await createClient();
  const monto = Number(formData.get("monto"));
  const cuentaId = texto(formData, "cuenta_id");
  const notas = texto(formData, "notas");
  const fecha = fechaDesdeFormulario(formData.get("fecha"));
  if (!Number.isFinite(monto) || monto <= 0) return { error: "El monto no es válido." };
  if (!cuentaId) return { error: "Elige a qué cuenta entró el dinero." };

  const { data: cobro } = await supabase.from("cobros_venta").select("*").eq("id", cobroId).maybeSingle<CobroVenta>();
  if (!cobro) return { error: "No se encontró el cobro." };

  const datos = await cargarVenta(supabase, cobro.venta_id);
  if (!datos) return { error: "No se encontró la venta." };
  const saldoSinEste = saldoVenta(datos.venta, datos.lineas, datos.cobros.filter((c) => c.id !== cobroId));
  if (monto > saldoSinEste + 0.01) {
    return { error: `Con este cambio cobrarías más del total de la venta (faltan ${saldoSinEste.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}).` };
  }

  if (cobro.movimiento_financiero_id) {
    const { error } = await supabase
      .from("movimientos_financieros")
      .update({ monto, fecha, cuenta_id: cuentaId, notas: notas ?? `Venta #${datos.venta.numero}` })
      .eq("id", cobro.movimiento_financiero_id);
    if (error) return { error: `No se pudo actualizar el movimiento en Finanzas: ${error.message}` };
  }
  const { error } = await supabase.from("cobros_venta").update({ monto, fecha, cuenta_id: cuentaId, notas }).eq("id", cobroId);
  if (error) return { error: error.message };

  refrescarVentas();
  revalidatePath(`/ventas/${cobro.venta_id}`);
  return { error: null };
}

export async function eliminarCobro(cobroId: string) {
  const supabase = await createClient();
  const { data: cobro } = await supabase.from("cobros_venta").select("*").eq("id", cobroId).maybeSingle<CobroVenta>();
  if (!cobro) return { error: "No se encontró el cobro." };

  if (cobro.movimiento_financiero_id) {
    const { error } = await supabase.from("movimientos_financieros").delete().eq("id", cobro.movimiento_financiero_id);
    if (error) return { error: `No se pudo borrar el movimiento en Finanzas: ${error.message}` };
  }
  const { error } = await supabase.from("cobros_venta").delete().eq("id", cobroId);
  if (error) return { error: error.message };

  refrescarVentas();
  revalidatePath(`/ventas/${cobro.venta_id}`);
  return { error: null };
}

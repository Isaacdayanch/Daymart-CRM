"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nombreArchivoSeguro, texto } from "@/lib/form-helpers";
import { obtenerPerfilActual } from "@/lib/perfil";
import { completarColumnasOmitidas, insertarMovimientosStock } from "@/lib/movimientos-stock";
import { guardarEnCatalogo } from "@/lib/catalogo";
import { stockActual } from "@/lib/calculos-stock";
import { costoUnitarioConFlete, estadoSegunRecibido, fechaLimitePago, montoRecibido, totalOrden } from "@/lib/calculos-compras";
import { registrarPagoFactura } from "@/app/finanzas/actions";
import type { CondicionesPago, FacturaPendiente, MovimientoStock, OrdenCompra, OrdenCompraLinea, PagoFactura, ProveedorMx } from "@/lib/tipos";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const CONDICIONES: CondicionesPago[] = ["ANTICIPADO", "AL_RECIBIR", "CREDITO"];

async function soloDueno() {
  const perfil = await obtenerPerfilActual();
  return perfil?.rol === "dueno";
}

function fechaDesdeFormulario(valor: FormDataEntryValue | null, siVacio: string | null = new Date().toISOString()) {
  return typeof valor === "string" && valor ? new Date(`${valor}T12:00:00`).toISOString() : siVacio;
}

/** Sin el SQL 0055 las tablas no existen: se dice claro en vez de un error críptico. */
function mensajeError(mensaje: string) {
  return /does not exist|schema cache|relation .* ordenes_compra|proveedores_mx/i.test(mensaje) ? `Falta correr el SQL 0055 en Supabase para activar Compras (${mensaje}).` : mensaje;
}

function refrescarCompras(ordenId?: string) {
  for (const ruta of ["/compras", "/compras/por-recibir", "/compras/proveedores", "/compras/nueva", "/finanzas", "/finanzas/facturas", "/stock", "/stock/movimientos", "/stock/restock", "/"]) revalidatePath(ruta);
  if (ordenId) {
    revalidatePath(`/compras/${ordenId}`);
    revalidatePath(`/compras/${ordenId}/editar`);
    revalidatePath(`/compras/${ordenId}/imprimir`);
  }
}

function leerCondiciones(formData: FormData): { condiciones: CondicionesPago; dias: number | null } {
  const c = texto(formData, "condiciones_pago") as CondicionesPago | null;
  const condiciones = c && CONDICIONES.includes(c) ? c : "AL_RECIBIR";
  const diasNum = Number(formData.get("dias_credito"));
  const dias = condiciones === "CREDITO" && Number.isFinite(diasNum) && diasNum > 0 ? Math.round(diasNum) : null;
  return { condiciones, dias };
}

// ---------- Proveedores ----------

function datosProveedor(formData: FormData) {
  const { condiciones, dias } = leerCondiciones(formData);
  return {
    nombre: texto(formData, "nombre"),
    contacto: texto(formData, "contacto"),
    telefono: texto(formData, "telefono"),
    correo: texto(formData, "correo"),
    rfc: texto(formData, "rfc"),
    notas: texto(formData, "notas"),
    condiciones_pago: condiciones,
    dias_credito: dias,
  };
}

export async function crearProveedor(formData: FormData) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto.", id: null };
  const supabase = await createClient();
  const datos = datosProveedor(formData);
  if (!datos.nombre) return { error: "Falta el nombre del proveedor.", id: null };
  const { data, error } = await supabase.from("proveedores_mx").insert(datos).select("id").single<{ id: string }>();
  if (error || !data) return { error: mensajeError(error?.message ?? "No se pudo guardar el proveedor."), id: null };
  refrescarCompras();
  return { error: null, id: data.id };
}

export async function actualizarProveedor(proveedorId: string, formData: FormData) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto." };
  const supabase = await createClient();
  const datos = datosProveedor(formData);
  if (!datos.nombre) return { error: "Falta el nombre del proveedor." };
  const { data: previo } = await supabase.from("proveedores_mx").select("nombre").eq("id", proveedorId).maybeSingle<{ nombre: string }>();
  const { error } = await supabase.from("proveedores_mx").update(datos).eq("id", proveedorId);
  if (error) return { error: mensajeError(error.message) };
  // Si cambió el nombre, sus cuentas por pagar en Finanzas lo siguen (es el
  // mismo proveedor).
  if (previo && previo.nombre !== datos.nombre) {
    const { data: ordenes } = await supabase.from("ordenes_compra").select("id").eq("proveedor_id", proveedorId).returns<{ id: string }[]>();
    const ids = (ordenes ?? []).map((o) => o.id);
    if (ids.length) await supabase.from("facturas_pendientes").update({ proveedor: datos.nombre }).in("orden_compra_id", ids);
  }
  refrescarCompras();
  return { error: null };
}

/** Lo manda a "eliminado" (sus órdenes pasadas lo siguen necesitando). Solo
 * si no tiene órdenes abiertas ni cuentas por pagar con saldo. */
export async function eliminarProveedor(proveedorId: string) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto." };
  const supabase = await createClient();
  const { count } = await supabase.from("ordenes_compra").select("id", { count: "exact", head: true }).eq("proveedor_id", proveedorId).in("estado", ["PEDIDA", "PARCIAL"]);
  if (count && count > 0) return { error: "Este proveedor tiene órdenes sin recibir — recíbelas o cancélalas antes de quitarlo." };
  const { error } = await supabase.from("proveedores_mx").update({ eliminado_en: new Date().toISOString() }).eq("id", proveedorId);
  if (error) return { error: mensajeError(error.message) };
  refrescarCompras();
  return { error: null };
}

// ---------- Órdenes de compra ----------

interface LineaEntrada {
  sku: string;
  nombre: string;
  imagenUrl: string | null;
  piezasPorCaja: number;
  cantidad: number;
  precioUnitario: number;
  /** Producto que no existe todavía en el CRM: se da de alta al guardar la orden. */
  nuevo?: { marcaId: string | null; categoria: string | null } | null;
}

function leerLineas(formData: FormData): { lineas: LineaEntrada[] | null; error: string | null } {
  const crudo = formData.get("lineas");
  let lineas: LineaEntrada[];
  try {
    lineas = typeof crudo === "string" ? JSON.parse(crudo) : [];
  } catch {
    return { lineas: null, error: "No se pudieron leer los productos de la orden." };
  }
  if (!Array.isArray(lineas) || lineas.length === 0) return { lineas: null, error: "Agrega al menos un producto a la orden." };
  for (const l of lineas) {
    l.sku = (l.sku ?? "").trim().toUpperCase();
    if (!l.sku || !l.nombre || !(Number(l.cantidad) > 0)) return { lineas: null, error: "Hay un producto sin SKU, sin nombre o con cantidad inválida." };
    if (!Number.isFinite(Number(l.precioUnitario)) || Number(l.precioUnitario) < 0) return { lineas: null, error: `El precio de ${l.nombre} no es válido.` };
    l.cantidad = Number(l.cantidad);
    l.precioUnitario = Number(l.precioUnitario);
    l.piezasPorCaja = Number(l.piezasPorCaja) > 0 ? Number(l.piezasPorCaja) : 1;
  }
  return { lineas, error: null };
}

async function subirFotoProducto(supabase: Supabase, archivo: FormDataEntryValue | null, sku: string) {
  if (!(archivo instanceof File) || archivo.size === 0) return { url: null, error: null };
  const ruta = `compras/${sku}-${crypto.randomUUID().slice(0, 8)}-${nombreArchivoSeguro(archivo.name)}`;
  const { error } = await supabase.storage.from("productos").upload(ruta, archivo);
  if (error) return { url: null, error: error.message };
  return { url: supabase.storage.from("productos").getPublicUrl(ruta).data.publicUrl, error: null };
}

/** Da de alta en el catálogo los productos nuevos de la orden (con su foto)
 * y deja la URL de la foto en la línea. */
async function darDeAltaNuevos(supabase: Supabase, lineas: LineaEntrada[], formData: FormData) {
  for (const l of lineas) {
    if (!l.nuevo) continue;
    const { url, error } = await subirFotoProducto(supabase, formData.get(`imagen_${l.sku}`), l.sku);
    if (error) return { error: `No se pudo subir la foto de ${l.nombre}: ${error}` };
    if (url) l.imagenUrl = url;
    const r = await guardarEnCatalogo(supabase, {
      sku: l.sku,
      nombre: l.nombre,
      marca_id: l.nuevo.marcaId,
      categoria: l.nuevo.categoria,
      imagen_url: l.imagenUrl,
      piezas_por_caja: l.piezasPorCaja,
    });
    if (r.error) return { error: `No se pudo dar de alta ${l.nombre} en el catálogo: ${r.error}` };
  }
  return { error: null };
}

async function resolverProveedor(supabase: Supabase, formData: FormData): Promise<{ proveedor: ProveedorMx | null; error: string | null }> {
  const proveedorId = texto(formData, "proveedor_id");
  const nuevoNombre = texto(formData, "nuevo_proveedor_nombre");
  if (proveedorId) {
    const { data } = await supabase.from("proveedores_mx").select("*").eq("id", proveedorId).maybeSingle<ProveedorMx>();
    return data ? { proveedor: data, error: null } : { proveedor: null, error: "No se encontró el proveedor." };
  }
  if (!nuevoNombre) return { proveedor: null, error: "Elige el proveedor (o escribe el nombre de uno nuevo)." };
  const { condiciones, dias } = leerCondiciones(formData);
  const { data, error } = await supabase
    .from("proveedores_mx")
    .insert({ nombre: nuevoNombre, telefono: texto(formData, "nuevo_proveedor_telefono"), condiciones_pago: condiciones, dias_credito: dias })
    .select("*")
    .single<ProveedorMx>();
  if (error || !data) return { proveedor: null, error: mensajeError(error?.message ?? "No se pudo crear el proveedor.") };
  return { proveedor: data, error: null };
}

function leerCabecera(formData: FormData) {
  const { condiciones, dias } = leerCondiciones(formData);
  const flete = Number(formData.get("flete"));
  return {
    bodega_id: texto(formData, "bodega_id"),
    fecha: fechaDesdeFormulario(formData.get("fecha")) as string,
    fecha_entrega: fechaDesdeFormulario(formData.get("fecha_entrega"), null),
    condiciones_pago: condiciones,
    dias_credito: dias,
    flete: Number.isFinite(flete) && flete > 0 ? flete : 0,
    notas_proveedor: texto(formData, "notas_proveedor"),
    notas: texto(formData, "notas"),
  };
}

/** Registra la orden completa en una sola operación: proveedor (nuevo si
 * hace falta), productos nuevos en el catálogo, la orden con sus líneas y
 * su cuenta por pagar en Finanzas → Facturas. Si algo falla a medio
 * camino, se deshace lo que ya se había guardado. */
export async function registrarOrden(formData: FormData) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto.", id: null };
  const supabase = await createClient();

  const { lineas, error: errorLineas } = leerLineas(formData);
  if (!lineas) return { error: errorLineas, id: null };
  const cabecera = leerCabecera(formData);
  if (cabecera.condiciones_pago === "CREDITO" && !cabecera.dias_credito) return { error: "Pon cuántos días de crédito te da el proveedor.", id: null };

  const { proveedor, error: errorProveedor } = await resolverProveedor(supabase, formData);
  if (!proveedor) return { error: errorProveedor, id: null };

  const alta = await darDeAltaNuevos(supabase, lineas, formData);
  if (alta.error) return { error: alta.error, id: null };

  const { data: orden, error: errorOrden } = await supabase
    .from("ordenes_compra")
    .insert({ proveedor_id: proveedor.id, ...cabecera, estado: "PEDIDA" })
    .select("id, numero")
    .single<{ id: string; numero: number }>();
  if (errorOrden || !orden) return { error: mensajeError(errorOrden?.message ?? "No se pudo guardar la orden."), id: null };

  async function deshacer(mensaje: string) {
    await supabase.from("facturas_pendientes").delete().eq("orden_compra_id", orden!.id);
    await supabase.from("ordenes_compra").delete().eq("id", orden!.id);
    return { error: mensaje, id: null };
  }

  const { error: errorInsertLineas } = await supabase.from("orden_compra_lineas").insert(
    lineas.map((l, i) => ({
      orden_id: orden.id,
      sku: l.sku,
      nombre: l.nombre,
      imagen_url: l.imagenUrl,
      piezas_por_caja: l.piezasPorCaja,
      cantidad: l.cantidad,
      precio_unitario: l.precioUnitario,
      orden: i,
    })),
  );
  if (errorInsertLineas) return deshacer(`No se pudieron guardar los productos: ${errorInsertLineas.message}`);

  const lineasCalculo = lineas.map((l) => ({ cantidad: l.cantidad, precio_unitario: l.precioUnitario }));
  const totalPedido = totalOrden(cabecera, lineasCalculo);
  // Una orden que vale $0 (muestras, regalo) no genera cuenta por pagar.
  if (totalPedido <= 0) {
    refrescarCompras(orden.id);
    return { error: null, id: orden.id };
  }
  const { error: errorFactura } = await supabase.from("facturas_pendientes").insert({
    proveedor: proveedor.nombre,
    concepto: `Orden de compra #${orden.numero}`,
    monto: totalPedido,
    moneda: "MXN",
    fecha_emision: cabecera.fecha,
    fecha_limite: fechaLimitePago(cabecera.condiciones_pago, cabecera.dias_credito, cabecera.fecha, cabecera.fecha_entrega, null),
    notas: "Cuenta por pagar de la orden de compra (sin folio todavía).",
    orden_compra_id: orden.id,
  });
  if (errorFactura) return deshacer(`Se guardó la orden pero no su cuenta por pagar en Finanzas: ${mensajeError(errorFactura.message)}`);

  refrescarCompras(orden.id);
  return { error: null, id: orden.id };
}

async function cargarOrden(supabase: Supabase, ordenId: string) {
  const [{ data: orden }, { data: lineas }, { data: factura }] = await Promise.all([
    supabase.from("ordenes_compra").select("*").eq("id", ordenId).maybeSingle<OrdenCompra>(),
    supabase.from("orden_compra_lineas").select("*").eq("orden_id", ordenId).order("orden").returns<OrdenCompraLinea[]>(),
    supabase.from("facturas_pendientes").select("*").eq("orden_compra_id", ordenId).maybeSingle<FacturaPendiente>(),
  ]);
  if (!orden) return null;
  const { data: proveedor } = await supabase.from("proveedores_mx").select("*").eq("id", orden.proveedor_id).maybeSingle<ProveedorMx>();
  return { orden, lineas: lineas ?? [], factura, proveedor };
}

/** Corrige una orden que todavía no ha recibido nada: productos, cantidades,
 * precios, fechas y condiciones. Su cuenta por pagar se actualiza igual. */
export async function actualizarOrden(ordenId: string, formData: FormData) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto." };
  const supabase = await createClient();
  const datos = await cargarOrden(supabase, ordenId);
  if (!datos) return { error: "No se encontró la orden." };
  if (datos.orden.estado !== "PEDIDA" || datos.lineas.some((l) => l.cantidad_recibida > 0)) {
    return { error: "Esta orden ya recibió mercancía (o está cerrada): ya no se edita. Para corregir, cancélala y captúrala de nuevo." };
  }

  const { lineas, error: errorLineas } = leerLineas(formData);
  if (!lineas) return { error: errorLineas };
  const cabecera = leerCabecera(formData);
  if (cabecera.condiciones_pago === "CREDITO" && !cabecera.dias_credito) return { error: "Pon cuántos días de crédito te da el proveedor." };
  const { proveedor, error: errorProveedor } = await resolverProveedor(supabase, formData);
  if (!proveedor) return { error: errorProveedor };
  const alta = await darDeAltaNuevos(supabase, lineas, formData);
  if (alta.error) return { error: alta.error };

  const { error: errorOrden } = await supabase.from("ordenes_compra").update({ proveedor_id: proveedor.id, ...cabecera }).eq("id", ordenId);
  if (errorOrden) return { error: errorOrden.message };
  const { error: errorBorrar } = await supabase.from("orden_compra_lineas").delete().eq("orden_id", ordenId);
  if (errorBorrar) return { error: errorBorrar.message };
  const { error: errorInsert } = await supabase.from("orden_compra_lineas").insert(
    lineas.map((l, i) => ({ orden_id: ordenId, sku: l.sku, nombre: l.nombre, imagen_url: l.imagenUrl, piezas_por_caja: l.piezasPorCaja, cantidad: l.cantidad, precio_unitario: l.precioUnitario, orden: i })),
  );
  if (errorInsert) return { error: `No se pudieron guardar los productos: ${errorInsert.message}` };

  const lineasCalculo = lineas.map((l) => ({ cantidad: l.cantidad, precio_unitario: l.precioUnitario }));
  const cambiosFactura = {
    proveedor: proveedor.nombre,
    monto: totalOrden(cabecera, lineasCalculo),
    fecha_emision: cabecera.fecha,
    fecha_limite: fechaLimitePago(cabecera.condiciones_pago, cabecera.dias_credito, cabecera.fecha, cabecera.fecha_entrega, null),
  };
  if (datos.factura && cambiosFactura.monto > 0) {
    const { error } = await supabase.from("facturas_pendientes").update(cambiosFactura).eq("id", datos.factura.id);
    if (error) return { error: `La orden se guardó pero no se pudo actualizar su cuenta por pagar: ${error.message}` };
  } else if (datos.factura) {
    await supabase.from("facturas_pendientes").delete().eq("id", datos.factura.id);
  } else if (cambiosFactura.monto > 0) {
    await supabase.from("facturas_pendientes").insert({ ...cambiosFactura, concepto: `Orden de compra #${datos.orden.numero}`, moneda: "MXN", orden_compra_id: ordenId });
  }
  refrescarCompras(ordenId);
  return { error: null };
}

/** Recibe mercancía de la orden (completa o en partes): genera las ENTRADAS
 * de stock con el costo por pieza (precio + flete repartido), suma lo
 * recibido en cada línea, actualiza el estado y ajusta la cuenta por pagar a
 * lo que de verdad llegó. */
export async function recibirOrden(ordenId: string, formData: FormData) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto." };
  const supabase = await createClient();
  const datos = await cargarOrden(supabase, ordenId);
  if (!datos) return { error: "No se encontró la orden." };
  const { orden, lineas, factura, proveedor } = datos;
  if (orden.estado === "CANCELADA") return { error: "Esta orden está cancelada." };
  if (orden.estado === "RECIBIDA") return { error: "Esta orden ya está cerrada." };

  const bodegaId = texto(formData, "bodega_id") ?? orden.bodega_id;
  if (!bodegaId) return { error: "Elige a qué bodega entra la mercancía." };
  const fecha = fechaDesdeFormulario(formData.get("fecha")) as string;
  let recibidas: { lineaId: string; cantidad: number }[];
  try {
    const crudo = formData.get("recibidas");
    recibidas = typeof crudo === "string" ? JSON.parse(crudo) : [];
  } catch {
    return { error: "No se pudo leer qué llegó." };
  }
  const conAlgo = recibidas.filter((r) => Number(r.cantidad) > 0);
  if (!conAlgo.length) return { error: "Pon cuántas piezas llegaron de al menos un producto." };

  const entradas: Record<string, unknown>[] = [];
  const nuevasRecibidas = new Map<string, number>();
  for (const r of conAlgo) {
    const linea = lineas.find((l) => l.id === r.lineaId);
    if (!linea) return { error: "Una de las líneas ya no existe en la orden." };
    const cantidad = Number(r.cantidad);
    nuevasRecibidas.set(linea.id, linea.cantidad_recibida + cantidad);
    entradas.push({
      tipo: "ENTRADA",
      sku: linea.sku,
      nombre: linea.nombre,
      bodega_id: bodegaId,
      cantidad,
      piezas_por_caja: linea.piezas_por_caja || 1,
      imagen_url: linea.imagen_url,
      costo_unitario_pesos: Math.round(costoUnitarioConFlete(linea, lineas, orden.flete) * 100) / 100,
      destino: null,
      referencia: `Orden de compra #${orden.numero} — ${proveedor?.nombre ?? "proveedor"}`,
      orden_compra_id: orden.id,
      creado_en: fecha,
    });
  }

  const { data: insertados, error: errorStock, columnasOmitidas } = await insertarMovimientosStock(supabase, entradas);
  if (errorStock) return { error: `No se pudo dar entrada al stock: ${errorStock}` };
  if (insertados && columnasOmitidas.length) await completarColumnasOmitidas(supabase, insertados.map((i) => i.id), entradas, columnasOmitidas);

  for (const [lineaId, total] of nuevasRecibidas) {
    const { error } = await supabase.from("orden_compra_lineas").update({ cantidad_recibida: total }).eq("id", lineaId);
    if (error) return { error: `El stock sí entró, pero no se pudo anotar lo recibido en la orden: ${error.message}` };
  }
  const lineasActualizadas = lineas.map((l) => ({ ...l, cantidad_recibida: nuevasRecibidas.get(l.id) ?? l.cantidad_recibida }));
  const estado = estadoSegunRecibido(lineasActualizadas);
  const recibidaEn = estado === "RECIBIDA" ? fecha : (orden.recibida_en ?? fecha);
  const { error: errorEstado } = await supabase
    .from("ordenes_compra")
    .update({ estado, recibida_en: recibidaEn, bodega_id: bodegaId })
    .eq("id", ordenId);
  if (errorEstado) return { error: `El stock sí entró, pero no se pudo actualizar el estado de la orden: ${errorEstado.message}` };

  if (factura) {
    await supabase
      .from("facturas_pendientes")
      .update({
        monto: Math.max(montoRecibido(orden, lineasActualizadas), 0.01),
        fecha_limite: fechaLimitePago(orden.condiciones_pago, orden.dias_credito, orden.fecha, orden.fecha_entrega, recibidaEn),
      })
      .eq("id", factura.id);
  }

  refrescarCompras(ordenId);
  for (const l of lineasActualizadas) revalidatePath(`/stock/producto/${encodeURIComponent(l.sku)}`);
  return { error: null, estado };
}

/** "Lo que falta ya no va a llegar": cierra la orden con lo recibido; la
 * cuenta por pagar se queda en lo que sí llegó. */
export async function cerrarOrden(ordenId: string) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto." };
  const supabase = await createClient();
  const datos = await cargarOrden(supabase, ordenId);
  if (!datos) return { error: "No se encontró la orden." };
  const { orden, lineas, factura } = datos;
  if (orden.estado !== "PEDIDA" && orden.estado !== "PARCIAL") return { error: "Esta orden ya está cerrada o cancelada." };
  const recibido = montoRecibido(orden, lineas);
  if (lineas.every((l) => l.cantidad_recibida <= 0)) return { error: "No has recibido nada de esta orden: si ya no va a llegar, cancélala." };
  const recibidaEn = orden.recibida_en ?? new Date().toISOString();
  const { error } = await supabase.from("ordenes_compra").update({ estado: "RECIBIDA", recibida_en: recibidaEn }).eq("id", ordenId);
  if (error) return { error: error.message };
  if (factura) {
    await supabase
      .from("facturas_pendientes")
      .update({ monto: Math.max(recibido, 0.01), fecha_limite: fechaLimitePago(orden.condiciones_pago, orden.dias_credito, orden.fecha, orden.fecha_entrega, recibidaEn) })
      .eq("id", factura.id);
  }
  refrescarCompras(ordenId);
  return { error: null };
}

/** Cancela la orden: quita sus entradas de stock (si las hubo y el stock no
 * queda en negativo) y su cuenta por pagar (solo si no tiene pagos). */
export async function cancelarOrden(ordenId: string) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto." };
  const supabase = await createClient();
  const datos = await cargarOrden(supabase, ordenId);
  if (!datos) return { error: "No se encontró la orden." };
  const { orden, lineas, factura } = datos;
  if (orden.estado === "CANCELADA") return { error: "Esta orden ya está cancelada." };

  if (factura) {
    const { count } = await supabase.from("pagos_factura").select("id", { count: "exact", head: true }).eq("factura_id", factura.id);
    if (count && count > 0) return { error: "Esta orden ya tiene pagos registrados. Quita primero esos pagos en Finanzas → Facturas (o déjala cerrada)." };
  }

  // Las entradas que ya se habían generado se quitan, siempre que el stock
  // de cada producto no quede en negativo (si ya vendiste de eso, no se puede).
  const { data: entradas } = await supabase.from("movimientos_stock").select("*").eq("orden_compra_id", ordenId).returns<MovimientoStock[]>();
  if (entradas?.length) {
    const skus = Array.from(new Set(entradas.map((e) => e.sku)));
    const { data: movs } = await supabase.from("movimientos_stock").select("*").in("sku", skus).returns<MovimientoStock[]>();
    for (const sku of skus) {
      const sinEstas = (movs ?? []).filter((m) => m.sku === sku && m.orden_compra_id !== ordenId);
      if (stockActual(sinEstas) < 0) {
        const nombre = lineas.find((l) => l.sku === sku)?.nombre ?? sku;
        return { error: `No se puede cancelar: ya saliste de piezas de "${nombre}" que entraron con esta orden (el stock quedaría en negativo).` };
      }
    }
    const { error } = await supabase.from("movimientos_stock").delete().eq("orden_compra_id", ordenId);
    if (error) return { error: `No se pudieron quitar las entradas de stock: ${error.message}` };
  }
  if (factura) {
    const { error } = await supabase.from("facturas_pendientes").delete().eq("id", factura.id);
    if (error) return { error: `No se pudo quitar la cuenta por pagar: ${error.message}` };
  }
  const { error } = await supabase.from("ordenes_compra").update({ estado: "CANCELADA", cancelada_en: new Date().toISOString() }).eq("id", ordenId);
  if (error) return { error: error.message };
  refrescarCompras(ordenId);
  for (const l of lineas) revalidatePath(`/stock/producto/${encodeURIComponent(l.sku)}`);
  return { error: null };
}

/** Folio de la factura del proveedor (o "sin factura") y fecha límite de
 * pago de la cuenta por pagar de la orden. */
export async function guardarFacturaOrden(ordenId: string, formData: FormData) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto." };
  const supabase = await createClient();
  const datos = await cargarOrden(supabase, ordenId);
  if (!datos) return { error: "No se encontró la orden." };
  if (!datos.factura) return { error: "Esta orden no tiene cuenta por pagar (está cancelada)." };
  const sinFactura = formData.get("sin_factura") === "true";
  const folio = sinFactura ? null : texto(formData, "folio");
  const fechaLimite = fechaDesdeFormulario(formData.get("fecha_limite"), null);
  const { error } = await supabase
    .from("facturas_pendientes")
    .update({
      folio,
      notas: sinFactura ? "Sin factura (nota de remisión)." : folio ? `Factura ${folio} de la orden de compra #${datos.orden.numero}.` : "Cuenta por pagar de la orden de compra (sin folio todavía).",
      ...(fechaLimite ? { fecha_limite: fechaLimite } : {}),
    })
    .eq("id", datos.factura.id);
  if (error) return { error: error.message };
  refrescarCompras(ordenId);
  return { error: null };
}

/** Registra un pago (anticipo, al recibir o abono a crédito) de la orden:
 * es exactamente el mismo mecanismo de Finanzas → Facturas → "Registrar
 * pago de factura" (sale el dinero real de la cuenta y se abona a la
 * cuenta por pagar). */
export async function registrarPagoOrden(ordenId: string, formData: FormData) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto." };
  const supabase = await createClient();
  const { data: factura } = await supabase.from("facturas_pendientes").select("*").eq("orden_compra_id", ordenId).maybeSingle<FacturaPendiente>();
  if (!factura) return { error: "Esta orden no tiene cuenta por pagar." };
  const { data: pagos } = await supabase.from("pagos_factura").select("*").eq("factura_id", factura.id).returns<PagoFactura[]>();
  const saldo = factura.monto - (pagos ?? []).reduce((s, p) => s + p.monto, 0);
  const monto = Number(formData.get("monto"));
  if (!Number.isFinite(monto) || monto <= 0) return { error: "El monto no es válido." };
  if (monto > saldo + 0.01) return { error: `Solo faltan ${saldo.toLocaleString("es-MX", { style: "currency", currency: "MXN" })} por pagar de esta orden.` };
  formData.set("factura_id", factura.id);
  // Categoría fija en Finanzas para estos pagos (se crea la primera vez).
  if (!texto(formData, "categoria_id") && !texto(formData, "categoria_nueva")) formData.set("categoria_nueva", "Compras a proveedores de México");
  const r = await registrarPagoFactura(formData);
  if (r?.error) return { error: r.error };
  refrescarCompras(ordenId);
  return { error: null };
}

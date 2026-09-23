"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { texto } from "@/lib/form-helpers";
import type { EnvioChina, Moneda, MovimientoFinanciero, TipoCuentaFinanciera, TipoMovimientoFinanciero } from "@/lib/tipos";
import { saldoCuenta } from "@/lib/calculos-financieras";
import { CATEGORIA_AJUSTE } from "@/lib/estado-cuenta";
import { recalcularCostoEntradasContenedor } from "@/app/contenedores/[id]/actions";

export async function agregarCuenta(formData: FormData) {
  const supabase = await createClient();
  const nombre = texto(formData, "nombre");
  const tipo = (texto(formData, "tipo") as TipoCuentaFinanciera) ?? "OTRO";
  const cuentaTransito = formData.get("cuenta_transito") === "true";
  if (!nombre) return { error: "Falta el nombre de la cuenta." };

  const { error } = await supabase
    .from("cuentas_financieras")
    .insert({ nombre, tipo, cuenta_transito: cuentaTransito });
  if (error) return { error: error.message };

  revalidatePath("/finanzas");
  revalidatePath("/finanzas/cuentas");
  revalidatePath("/finanzas/balance");
  return { error: null };
}

/** Quitar una cuenta NO es un clic: Isaac tiene que escribir el nombre
 * exacto (tiene historial importante). Es un soft delete — sus movimientos
 * se quedan en el libro y siguen contando donde ya contaban. */
export async function eliminarCuenta(cuentaId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: cuenta } = await supabase
    .from("cuentas_financieras")
    .select("nombre")
    .eq("id", cuentaId)
    .maybeSingle<{ nombre: string }>();
  if (!cuenta) return { error: "No se encontró la cuenta." };
  const confirmacion = texto(formData, "confirmacion") ?? "";
  if (confirmacion.trim().toLowerCase() !== cuenta.nombre.trim().toLowerCase()) {
    return { error: `Para quitarla escribe exactamente el nombre: ${cuenta.nombre}` };
  }
  const { error } = await supabase
    .from("cuentas_financieras")
    .update({ eliminado_en: new Date().toISOString() })
    .eq("id", cuentaId);
  if (error) return { error: error.message };
  revalidatePath("/finanzas");
  revalidatePath("/finanzas/cuentas");
  revalidatePath("/finanzas/balance");
  return { error: null };
}

/** Id de la categoría fija "Ajuste de saldo"; si falta (SQL 0034 sin
 * correr), se crea aquí mismo para que no truene. */
async function categoriaAjusteId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase
    .from("categorias_financieras")
    .select("id")
    .eq("nombre", CATEGORIA_AJUSTE)
    .maybeSingle<{ id: string }>();
  if (data?.id) return data.id;
  const { data: nueva, error } = await supabase
    .from("categorias_financieras")
    .insert({ nombre: CATEGORIA_AJUSTE, fija: true, orden: 99 })
    .select("id")
    .single<{ id: string }>();
  if (error || !nueva) throw new Error(error?.message ?? "No se pudo crear la categoría de ajuste.");
  return nueva.id;
}

/** "Ajustar saldo al del banco": Isaac escribe el saldo real que ve en el
 * banco (o en su caja) y el sistema registra la diferencia como un
 * movimiento en la categoría "Ajuste de saldo" — así el estado de cuenta
 * cuadra sin inventar un gasto ni una entrada falsa. */
export async function ajustarSaldoCuenta(cuentaId: string, formData: FormData) {
  const supabase = await createClient();
  const saldoReal = Number(formData.get("saldo_real"));
  const moneda = (formData.get("moneda") as Moneda) || "MXN";
  const notas = texto(formData, "notas");
  if (!Number.isFinite(saldoReal)) return { error: "Escribe el saldo real." };

  const { data: movimientos } = await supabase
    .from("movimientos_financieros")
    .select("*")
    .or(`cuenta_id.eq.${cuentaId},cuenta_destino_id.eq.${cuentaId}`)
    .returns<MovimientoFinanciero[]>();
  const saldoSistema = saldoCuenta(movimientos ?? [], cuentaId, moneda);
  const diferencia = Math.round((saldoReal - saldoSistema) * 100) / 100;
  if (Math.abs(diferencia) < 0.005) return { error: "El saldo ya cuadra, no hace falta ajustar." };

  const fechaCampo = formData.get("fecha");
  const fecha =
    typeof fechaCampo === "string" && fechaCampo ? new Date(`${fechaCampo}T12:00:00`).toISOString() : new Date().toISOString();

  let categoriaId: string;
  try {
    categoriaId = await categoriaAjusteId(supabase);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo preparar el ajuste." };
  }
  const { error } = await supabase.from("movimientos_financieros").insert({
    tipo: diferencia > 0 ? "ENTRADA" : "SALIDA",
    cuenta_id: cuentaId,
    cuenta_destino_id: null,
    categoria_id: categoriaId,
    monto: Math.abs(diferencia),
    moneda,
    fecha,
    contraparte: null,
    notas: notas ?? `Ajuste para cuadrar con el saldo real (${saldoReal.toLocaleString("es-MX", { minimumFractionDigits: 2 })})`,
  });
  if (error) return { error: error.message };
  revalidarFinanzas();
  return { error: null, diferencia };
}

function revalidarFinanzas() {
  revalidatePath("/finanzas");
  revalidatePath("/finanzas/movimientos");
  revalidatePath("/finanzas/cuentas");
  revalidatePath("/finanzas/balance");
  revalidatePath("/finanzas/maaser");
  revalidatePath("/");
}

export async function agregarCategoria(formData: FormData) {
  const supabase = await createClient();
  const nombre = texto(formData, "nombre");
  if (!nombre) return;

  const { data: maxOrden } = await supabase
    .from("categorias_financieras")
    .select("orden")
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle<{ orden: number }>();

  await supabase.from("categorias_financieras").insert({ nombre, orden: (maxOrden?.orden ?? 0) + 1 });

  revalidatePath("/finanzas/categorias");
}

export async function renombrarCategoria(categoriaId: string, formData: FormData) {
  const supabase = await createClient();
  const nombre = texto(formData, "nombre");
  if (!nombre) return;

  await supabase.from("categorias_financieras").update({ nombre }).eq("id", categoriaId);

  revalidatePath("/finanzas/categorias");
}

/** Las categorías "fijas" (Comisiones, Sueldo) no se pueden borrar porque
 * otras partes del sistema las usan automáticamente (el fee de un pago a
 * China, el retiro de sueldo) — si se borraran, esos movimientos se
 * quedarían sin categoría. */
export async function eliminarCategoria(categoriaId: string) {
  const supabase = await createClient();
  const { data: categoria } = await supabase
    .from("categorias_financieras")
    .select("fija")
    .eq("id", categoriaId)
    .maybeSingle<{ fija: boolean }>();
  if (categoria?.fija) return;

  await supabase.from("categorias_financieras").update({ eliminado_en: new Date().toISOString() }).eq("id", categoriaId);
  revalidatePath("/finanzas/categorias");
}

/** Registra un movimiento (entrada, salida o transferencia entre cuentas
 * propias) — la columna vertebral de Finanzas. Cuando es una salida o una
 * transferencia con comisión, el monto que se guarda en el movimiento
 * principal es el neto (lo que de verdad le llegó al destinatario o a la
 * cuenta destino) y la diferencia se guarda como un segundo movimiento de
 * salida en la categoría "Comisiones" desde la misma cuenta de origen,
 * ligado al primero — juntos suman el total que de verdad salió de la
 * cuenta, sin inflar ni duplicar nada. */
/** Categoría del formulario: el id elegido, o si Isaac escribió una nueva
 * en el selector (`categoria_nueva`), se da de alta (o se reutiliza si ya
 * existía con ese nombre) y se devuelve su id. */
async function resolverCategoriaId(supabase: Awaited<ReturnType<typeof createClient>>, formData: FormData) {
  const nueva = texto(formData, "categoria_nueva");
  if (!nueva) return texto(formData, "categoria_id");
  const { data: existente } = await supabase.from("categorias_financieras").select("id").ilike("nombre", nueva).is("eliminado_en", null).maybeSingle<{ id: string }>();
  if (existente) return existente.id;
  const { data: ultima } = await supabase.from("categorias_financieras").select("orden").order("orden", { ascending: false }).limit(1).maybeSingle<{ orden: number }>();
  const { data: creada, error } = await supabase
    .from("categorias_financieras")
    .insert({ nombre: nueva, fija: false, orden: (ultima?.orden ?? 0) + 1 })
    .select("id")
    .single<{ id: string }>();
  if (error || !creada) return texto(formData, "categoria_id");
  revalidatePath("/finanzas/categorias");
  return creada.id;
}

export async function registrarMovimiento(formData: FormData) {
  const supabase = await createClient();

  const tipo = formData.get("tipo") as TipoMovimientoFinanciero;
  const cuentaId = formData.get("cuenta_id") as string;
  const cuentaDestinoId = formData.get("cuenta_destino_id") as string | null;
  const categoriaId = await resolverCategoriaId(supabase, formData);
  const monto = Number(formData.get("monto"));
  const moneda = (formData.get("moneda") as Moneda) || "MXN";
  const contraparte = texto(formData, "contraparte");
  const notas = texto(formData, "notas");
  const tieneComision =
    formData.get("tiene_comision") === "true" && (tipo === "SALIDA" || tipo === "TRANSFERENCIA");
  const montoNeto = Number(formData.get("monto_neto"));
  // "La comisión la sé después": se guarda por el monto completo y marcado.
  const comisionDespues = !tieneComision && formData.get("comision_despues") === "true" && (tipo === "SALIDA" || tipo === "TRANSFERENCIA");

  const fechaCampo = formData.get("fecha");
  const fecha =
    typeof fechaCampo === "string" && fechaCampo
      ? new Date(`${fechaCampo}T12:00:00`).toISOString()
      : new Date().toISOString();

  if (!cuentaId || !Number.isFinite(monto) || monto <= 0) {
    return { error: "Falta la cuenta o el monto no es válido." };
  }
  if (tipo === "TRANSFERENCIA" && (!cuentaDestinoId || cuentaDestinoId === cuentaId)) {
    return { error: "Elige una cuenta destino distinta a la de origen." };
  }
  if (tieneComision && (!Number.isFinite(montoNeto) || montoNeto <= 0 || montoNeto >= monto)) {
    return { error: "El monto neto debe ser mayor a cero y menor al monto que se debitó." };
  }

  const { data: principal, error: errorPrincipal } = await supabase
    .from("movimientos_financieros")
    .insert({
      tipo,
      cuenta_id: cuentaId,
      cuenta_destino_id: tipo === "TRANSFERENCIA" ? cuentaDestinoId : null,
      categoria_id: tipo === "TRANSFERENCIA" ? null : categoriaId,
      monto: tieneComision ? montoNeto : monto,
      moneda,
      fecha,
      contraparte,
      notas,
      comision_pendiente: comisionDespues,
    })
    .select("id")
    .single();

  if (errorPrincipal || !principal) {
    return { error: errorPrincipal?.message ?? "No se pudo guardar el movimiento." };
  }

  if (tieneComision) {
    const { data: categoriaComisiones } = await supabase
      .from("categorias_financieras")
      .select("id")
      .eq("nombre", "Comisiones")
      .maybeSingle<{ id: string }>();

    const { error: errorComision } = await supabase.from("movimientos_financieros").insert({
      tipo: "SALIDA",
      cuenta_id: cuentaId,
      categoria_id: categoriaComisiones?.id ?? null,
      monto: monto - montoNeto,
      moneda,
      fecha,
      contraparte,
      notas: "Comisión de la transacción",
      referencia_tipo: "COMISION",
      referencia_id: principal.id,
    });
    if (errorComision) {
      return { error: `Se guardó el movimiento, pero la comisión no se pudo guardar: ${errorComision.message}` };
    }
  }

  revalidatePath("/finanzas");
  revalidatePath("/finanzas/movimientos");
  revalidatePath("/");
  return { error: null };
}

/** Un movimiento está "ligado" cuando otra pantalla lo generó y guarda su
 * propio dato en paralelo (un abono de mercancía, un abono a proveedor, un
 * pago de factura) — editarlo aquí directo lo desincronizaría de ese otro
 * registro (el mismo tipo de bug que ya se corrigió varias veces en este
 * proyecto). Esos casos se editan desde su pantalla de origen; aquí solo
 * se pueden editar/borrar los movimientos "sueltos" (ej. Sueldo, Nómina,
 * cualquier "Agregar/Mandar dinero" o transferencia registrada directo en
 * Movimientos). */
async function movimientoEstaLigado(supabase: Awaited<ReturnType<typeof createClient>>, movimientoId: string) {
  const [{ count: enMercancia }, { count: enDeudaProveedor }, { count: enFactura }, { count: enCobroVenta }] = await Promise.all([
    supabase
      .from("pagos_mercancia")
      .select("id", { count: "exact", head: true })
      .eq("movimiento_financiero_id", movimientoId),
    supabase
      .from("movimientos_deuda_proveedor")
      .select("id", { count: "exact", head: true })
      .eq("movimiento_financiero_id", movimientoId),
    supabase
      .from("pagos_factura")
      .select("id", { count: "exact", head: true })
      .eq("movimiento_financiero_id", movimientoId),
    supabase
      .from("cobros_venta")
      .select("id", { count: "exact", head: true })
      .eq("movimiento_financiero_id", movimientoId),
  ]);
  // La transferencia a la cuenta puente de un envío a China pendiente se
  // maneja desde el aviso ámbar (completar/anular), no desde aquí.
  const { count: enEnvioChina } = await supabase
    .from("envios_china")
    .select("id", { count: "exact", head: true })
    .eq("estado", "PENDIENTE")
    .eq("movimiento_transferencia_id", movimientoId);
  return Boolean(enMercancia || enDeudaProveedor || enFactura || enCobroVenta || enEnvioChina);
}

const MENSAJE_MOVIMIENTO_LIGADO =
  "Este movimiento viene de un abono de contenedor, de proveedores, de una factura o de un cobro de venta — edítalo desde esa pantalla para no desincronizar los datos.";

/** Edita un movimiento "suelto" (sin dueño en otra pantalla) — ej. cuando
 * Isaac saca un sueldo y luego quiere sumarle un complemento del mismo
 * día, entra aquí y corrige el monto en vez de crear un movimiento aparte. */
export async function actualizarMovimiento(movimientoId: string, formData: FormData) {
  const supabase = await createClient();

  if (await movimientoEstaLigado(supabase, movimientoId)) {
    return { error: MENSAJE_MOVIMIENTO_LIGADO };
  }

  const { data: actual } = await supabase
    .from("movimientos_financieros")
    .select("tipo")
    .eq("id", movimientoId)
    .maybeSingle<{ tipo: TipoMovimientoFinanciero }>();
  if (!actual) return { error: "No se encontró el movimiento." };

  const cuentaId = formData.get("cuenta_id") as string;
  const cuentaDestinoId = texto(formData, "cuenta_destino_id");
  let categoriaId = await resolverCategoriaId(supabase, formData);
  const monto = Number(formData.get("monto"));
  const contraparte = texto(formData, "contraparte");
  const notas = texto(formData, "notas");

  if (!cuentaId || !Number.isFinite(monto) || monto <= 0) {
    return { error: "Falta la cuenta o el monto no es válido." };
  }
  if (actual.tipo === "TRANSFERENCIA" && (!cuentaDestinoId || cuentaDestinoId === cuentaId)) {
    return { error: "Elige una cuenta destino distinta a la de origen." };
  }

  // Al editar, Isaac puede decir qué es: Entrada, Salida (gasto) o Ajuste
  // (para cuadrar con el banco; suma o resta según lo elija). Una
  // transferencia se queda como transferencia.
  let tipoNuevo: TipoMovimientoFinanciero = actual.tipo;
  if (actual.tipo !== "TRANSFERENCIA") {
    const eleccion = texto(formData, "tipo_edicion");
    if (eleccion === "ENTRADA" || eleccion === "SALIDA") tipoNuevo = eleccion;
    else if (eleccion === "AJUSTE") {
      tipoNuevo = texto(formData, "ajuste_signo") === "RESTA" ? "SALIDA" : "ENTRADA";
      try {
        categoriaId = await categoriaAjusteId(supabase);
      } catch (e) {
        return { error: e instanceof Error ? e.message : "No se pudo preparar el ajuste." };
      }
    }
  }

  const fechaCampo = formData.get("fecha");
  const fecha =
    typeof fechaCampo === "string" && fechaCampo
      ? new Date(`${fechaCampo}T12:00:00`).toISOString()
      : new Date().toISOString();

  const { error } = await supabase
    .from("movimientos_financieros")
    .update({
      tipo: tipoNuevo,
      cuenta_id: cuentaId,
      cuenta_destino_id: actual.tipo === "TRANSFERENCIA" ? cuentaDestinoId : null,
      categoria_id: actual.tipo === "TRANSFERENCIA" ? null : categoriaId,
      monto,
      fecha,
      contraparte,
      notas,
    })
    .eq("id", movimientoId);
  if (error) return { error: error.message };

  revalidarFinanzas();
  return { error: null };
}

export async function eliminarMovimiento(movimientoId: string) {
  const supabase = await createClient();

  if (await movimientoEstaLigado(supabase, movimientoId)) {
    return { error: MENSAJE_MOVIMIENTO_LIGADO };
  }

  const { error } = await supabase.from("movimientos_financieros").delete().eq("id", movimientoId);
  if (error) return { error: error.message };

  revalidarFinanzas();
  return { error: null };
}

/** Da de alta una factura pendiente de pagar (proveedor de México, etc.)
 * — todavía no genera ningún movimiento, es solo el recordatorio de que se
 * debe. El movimiento real se crea hasta que se marca "Pagada". */
/** Da de alta una factura pendiente — no toca préstamos, deuda de
 * proveedores ni crédito de China, es un mundo aparte (cuentas por pagar
 * sueltas). Regresa el error real si algo falla, en vez de fallar en
 * silencio (antes esta acción no avisaba nada si el monto venía inválido). */
export async function agregarFactura(formData: FormData) {
  const supabase = await createClient();

  const folio = texto(formData, "folio");
  const proveedor = texto(formData, "proveedor");
  const concepto = texto(formData, "concepto");
  const monto = Number(formData.get("monto"));
  const moneda = (formData.get("moneda") as Moneda) || "MXN";
  const notas = texto(formData, "notas");

  if (!proveedor) return { error: "Falta el proveedor." };
  if (!Number.isFinite(monto) || monto <= 0) return { error: "El monto no es válido." };

  const fechaEmisionCampo = formData.get("fecha_emision");
  const fechaEmision =
    typeof fechaEmisionCampo === "string" && fechaEmisionCampo
      ? new Date(`${fechaEmisionCampo}T12:00:00`).toISOString()
      : new Date().toISOString();

  const fechaLimiteCampo = formData.get("fecha_limite");
  const fechaLimite =
    typeof fechaLimiteCampo === "string" && fechaLimiteCampo
      ? new Date(`${fechaLimiteCampo}T12:00:00`).toISOString()
      : null;

  const { error } = await supabase.from("facturas_pendientes").insert({
    folio,
    proveedor,
    concepto,
    monto,
    moneda,
    fecha_emision: fechaEmision,
    fecha_limite: fechaLimite,
    notas,
  });
  if (error) return { error: error.message };

  revalidatePath("/finanzas/facturas");
  return { error: null };
}

/** Registra un abono a una factura (puede ser parcial) — genera su salida
 * en Finanzas en la misma operación, igual que el resto del sistema. La
 * factura nunca guarda "pagada" a mano: su saldo se calcula sumando todos
 * sus pagos (src/lib/calculos-facturas.ts). */
export async function registrarPagoFactura(formData: FormData) {
  const supabase = await createClient();

  const facturaId = formData.get("factura_id") as string;
  const cuentaId = formData.get("cuenta_id") as string;
  const cuentaDestinoId = texto(formData, "cuenta_destino_id");
  const categoriaId = await resolverCategoriaId(supabase, formData);
  const monto = Number(formData.get("monto"));
  const notas = texto(formData, "notas");
  const tieneComision = formData.get("tiene_comision") === "true";
  const montoNeto = Number(formData.get("monto_neto"));
  const comisionDespues = !tieneComision && formData.get("comision_despues") === "true";
  // Cuánto se descuenta de la factura: por defecto el monto completo que
  // se debitó; desde el registro de movimientos Isaac puede poner otro (ej.
  // solo el neto que le llegó al proveedor).
  const montoFacturaCampo = Number(formData.get("monto_factura"));
  const montoFactura = Number.isFinite(montoFacturaCampo) && montoFacturaCampo > 0 ? montoFacturaCampo : monto;

  if (!facturaId) return { error: "Elige qué factura vas a pagar." };
  if (!Number.isFinite(monto) || monto <= 0) return { error: "El monto no es válido." };
  // Sin cuenta = pago de antes de usar el sistema: solo se abona a la
  // factura, sin movimiento de Finanzas (no aplica vía cuenta puente ni con
  // comisión, porque ahí sí hay dinero real moviéndose hoy).
  if (!cuentaId) {
    if (cuentaDestinoId || tieneComision || comisionDespues) return { error: "Elige de qué cuenta sale el pago." };
    const fechaHist = formData.get("fecha");
    const { error: errorHistorico } = await supabase.from("pagos_factura").insert({
      factura_id: facturaId,
      monto: montoFactura,
      fecha: typeof fechaHist === "string" && fechaHist ? new Date(`${fechaHist}T12:00:00`).toISOString() : new Date().toISOString(),
      cuenta_id: null,
      categoria_id: categoriaId,
      notas: notas ?? "Pago de antes de usar el sistema (sin cuenta)",
      movimiento_financiero_id: null,
    });
    if (errorHistorico) return { error: errorHistorico.message };
    revalidatePath("/finanzas/facturas");
    revalidatePath("/finanzas");
    return { error: null };
  }
  if (tieneComision && (!Number.isFinite(montoNeto) || montoNeto <= 0 || montoNeto >= monto)) {
    return { error: "El monto neto debe ser mayor a cero y menor al monto que se debitó." };
  }

  const { data: factura } = await supabase
    .from("facturas_pendientes")
    .select("proveedor, folio, moneda")
    .eq("id", facturaId)
    .maybeSingle<{ proveedor: string; folio: string | null; moneda: Moneda }>();
  if (!factura) return { error: "No se encontró la factura." };

  const fechaCampo = formData.get("fecha");
  const fecha =
    typeof fechaCampo === "string" && fechaCampo
      ? new Date(`${fechaCampo}T12:00:00`).toISOString()
      : new Date().toISOString();

  const notasMovimiento = notas ?? (factura.folio ? `Factura ${factura.folio}` : null);

  const { data: movimiento, error: errorMovimiento } = await supabase
    .from("movimientos_financieros")
    .insert({
      tipo: cuentaDestinoId ? "TRANSFERENCIA" : "SALIDA",
      cuenta_id: cuentaId,
      cuenta_destino_id: cuentaDestinoId || null,
      categoria_id: cuentaDestinoId ? null : categoriaId,
      monto: tieneComision ? montoNeto : monto,
      moneda: factura.moneda,
      fecha,
      contraparte: factura.proveedor,
      notas: notasMovimiento,
      referencia_tipo: "FACTURA",
      referencia_id: facturaId,
      comision_pendiente: comisionDespues,
    })
    .select("id")
    .single();
  if (errorMovimiento || !movimiento) {
    return { error: errorMovimiento?.message ?? "No se pudo guardar el pago." };
  }

  if (tieneComision) {
    const { data: categoriaComisiones } = await supabase
      .from("categorias_financieras")
      .select("id")
      .eq("nombre", "Comisiones")
      .maybeSingle<{ id: string }>();

    const { error: errorComision } = await supabase.from("movimientos_financieros").insert({
      tipo: "SALIDA",
      cuenta_id: cuentaId,
      categoria_id: categoriaComisiones?.id ?? null,
      monto: monto - montoNeto,
      moneda: factura.moneda,
      fecha,
      contraparte: factura.proveedor,
      notas: "Comisión de la transacción",
      referencia_tipo: "COMISION",
      referencia_id: movimiento.id,
    });
    if (errorComision) {
      return { error: `Se guardó el movimiento, pero la comisión no se pudo guardar: ${errorComision.message}` };
    }
  }

  const { error: errorPago } = await supabase.from("pagos_factura").insert({
    factura_id: facturaId,
    monto: montoFactura,
    fecha,
    cuenta_id: cuentaId,
    categoria_id: categoriaId,
    notas,
    movimiento_financiero_id: movimiento.id,
  });
  if (errorPago) {
    return { error: `Se guardó en Finanzas, pero no se pudo ligar el pago a la factura: ${errorPago.message}` };
  }

  revalidatePath("/finanzas/facturas");
  revalidatePath("/finanzas");
  revalidatePath("/finanzas/movimientos");
  return { error: null };
}

/** Corrige un pago de factura ya guardado — actualiza el pago Y su
 * movimiento de Finanzas ligado en la misma operación (nunca dos registros
 * sueltos que "deberían" coincidir). */
/** El pago puede quedar "sin cuenta" (cuentaId vacío) para un pago que ya
 * había pasado antes de usar el sistema — se guarda el abono a la factura
 * para llevar el saldo, pero sin tocar ninguna cuenta real de Finanzas.
 * Por eso este update tiene que poder crear, actualizar o borrar el
 * movimiento_financiero ligado según cómo cambie la cuenta. */
export async function actualizarPagoFactura(pagoId: string, formData: FormData) {
  const supabase = await createClient();

  const monto = Number(formData.get("monto"));
  const cuentaId = texto(formData, "cuenta_id");
  const notas = texto(formData, "notas");
  if (!Number.isFinite(monto) || monto <= 0) return { error: "El monto no es válido." };

  const fechaCampo = formData.get("fecha");
  const fecha =
    typeof fechaCampo === "string" && fechaCampo
      ? new Date(`${fechaCampo}T12:00:00`).toISOString()
      : new Date().toISOString();

  const { data: pago } = await supabase
    .from("pagos_factura")
    .select("movimiento_financiero_id, factura_id")
    .eq("id", pagoId)
    .maybeSingle<{ movimiento_financiero_id: string | null; factura_id: string }>();
  if (!pago) return { error: "No se encontró el pago." };

  if (pago.movimiento_financiero_id && !cuentaId) {
    // Tenía cuenta y ahora se está marcando como "sin cuenta": se borra el
    // movimiento real de Finanzas, ya no debe contar contra ninguna cuenta.
    const { error: errorBorrar } = await supabase
      .from("movimientos_financieros")
      .delete()
      .eq("id", pago.movimiento_financiero_id);
    if (errorBorrar) return { error: errorBorrar.message };
  } else if (pago.movimiento_financiero_id && cuentaId) {
    const { error: errorMovimiento } = await supabase
      .from("movimientos_financieros")
      .update({ monto, cuenta_id: cuentaId, fecha, notas })
      .eq("id", pago.movimiento_financiero_id);
    if (errorMovimiento) return { error: errorMovimiento.message };
  }

  let movimientoFinancieroId = pago.movimiento_financiero_id;
  if (!pago.movimiento_financiero_id && cuentaId) {
    // No tenía cuenta y ahora sí se le está asignando una: se crea el
    // movimiento real de Finanzas por primera vez.
    const { data: factura } = await supabase
      .from("facturas_pendientes")
      .select("proveedor, folio, moneda")
      .eq("id", pago.factura_id)
      .maybeSingle<{ proveedor: string; folio: string | null; moneda: Moneda }>();
    if (!factura) return { error: "No se encontró la factura." };

    const { data: movimiento, error: errorMovimiento } = await supabase
      .from("movimientos_financieros")
      .insert({
        tipo: "SALIDA",
        cuenta_id: cuentaId,
        monto,
        moneda: factura.moneda,
        fecha,
        contraparte: factura.proveedor,
        notas: notas ?? (factura.folio ? `Factura ${factura.folio}` : null),
        referencia_tipo: "FACTURA",
        referencia_id: pago.factura_id,
      })
      .select("id")
      .single();
    if (errorMovimiento || !movimiento) return { error: errorMovimiento?.message ?? "No se pudo guardar el pago." };
    movimientoFinancieroId = movimiento.id;
  } else if (!cuentaId) {
    movimientoFinancieroId = null;
  }

  const { error: errorPago } = await supabase
    .from("pagos_factura")
    .update({ monto, cuenta_id: cuentaId || null, movimiento_financiero_id: movimientoFinancieroId, fecha, notas })
    .eq("id", pagoId);
  if (errorPago) return { error: errorPago.message };

  revalidatePath("/finanzas/facturas");
  revalidatePath("/finanzas");
  revalidatePath("/finanzas/movimientos");
  return { error: null };
}

/** Borra un pago de factura junto con su movimiento de Finanzas ligado. */
export async function eliminarPagoFactura(pagoId: string) {
  const supabase = await createClient();

  const { data: pago } = await supabase
    .from("pagos_factura")
    .select("movimiento_financiero_id")
    .eq("id", pagoId)
    .maybeSingle<{ movimiento_financiero_id: string | null }>();

  if (pago?.movimiento_financiero_id) {
    await supabase.from("movimientos_financieros").delete().eq("id", pago.movimiento_financiero_id);
  }
  await supabase.from("pagos_factura").delete().eq("id", pagoId);

  revalidatePath("/finanzas/facturas");
  revalidatePath("/finanzas");
  revalidatePath("/finanzas/movimientos");
}

/** Solo se puede borrar una factura que todavía no tiene ningún pago
 * registrado — una con pagos ya tiene movimientos reales de Finanzas
 * ligados y borrarla los dejaría sin explicación. */
export async function eliminarFactura(facturaId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("pagos_factura")
    .select("id", { count: "exact", head: true })
    .eq("factura_id", facturaId);
  if (count && count > 0) return;

  await supabase.from("facturas_pendientes").delete().eq("id", facturaId);
  revalidatePath("/finanzas/facturas");
}

/** Registra cuánto ganó Isaac (ganancia neta, después de gastos) en un
 * periodo — es el dato del que se calcula el 10% de Maaser. No mueve
 * dinero de ninguna cuenta (la ganancia ya se refleja sola en cómo se
 * movió el dinero en Finanzas); es solo el número base del cálculo. */
export async function agregarRegistroGanancia(formData: FormData) {
  const supabase = await createClient();
  const monto = Number(formData.get("monto"));
  const notas = texto(formData, "notas");
  if (!Number.isFinite(monto) || monto <= 0) return;

  const fechaCampo = formData.get("fecha");
  const fecha =
    typeof fechaCampo === "string" && fechaCampo
      ? new Date(`${fechaCampo}T12:00:00`).toISOString()
      : new Date().toISOString();

  await supabase.from("registros_ganancia").insert({ monto, fecha, notas });
  revalidatePath("/finanzas/maaser");
}

export async function eliminarRegistroGanancia(registroId: string) {
  const supabase = await createClient();
  await supabase.from("registros_ganancia").delete().eq("id", registroId);
  revalidatePath("/finanzas/maaser");
}

export async function agregarSocio(formData: FormData) {
  const supabase = await createClient();
  const nombre = texto(formData, "nombre");
  if (!nombre) return;
  await supabase.from("socios").insert({ nombre });
  revalidatePath("/finanzas/socios");
}

/** Un aporte de capital o un reparto de un socio — genera su movimiento
 * real en Finanzas (Entrada "Aporte a capital" o Salida "Repartos") en la
 * misma operación, igual que el resto del módulo. */
export async function registrarMovimientoSocio(formData: FormData) {
  const supabase = await createClient();

  const socioId = formData.get("socio_id") as string;
  const tipo = formData.get("tipo") as "APORTE" | "REPARTO";
  const cuentaId = formData.get("cuenta_id") as string;
  const monto = Number(formData.get("monto"));
  const moneda = (formData.get("moneda") as Moneda) || "MXN";
  const notas = texto(formData, "notas");

  if (!socioId || !cuentaId || !Number.isFinite(monto) || monto <= 0) {
    return { error: "Falta el socio, la cuenta o el monto no es válido." };
  }

  const fechaCampo = formData.get("fecha");
  const fecha =
    typeof fechaCampo === "string" && fechaCampo
      ? new Date(`${fechaCampo}T12:00:00`).toISOString()
      : new Date().toISOString();

  const { data: categoria } = await supabase
    .from("categorias_financieras")
    .select("id")
    .eq("nombre", tipo === "APORTE" ? "Aporte a capital" : "Repartos")
    .maybeSingle<{ id: string }>();

  const { data: movimiento, error: errorMovimiento } = await supabase
    .from("movimientos_financieros")
    .insert({
      tipo: tipo === "APORTE" ? "ENTRADA" : "SALIDA",
      cuenta_id: cuentaId,
      categoria_id: categoria?.id ?? null,
      monto,
      moneda,
      fecha,
      notas,
    })
    .select("id")
    .single();
  if (errorMovimiento || !movimiento) {
    return { error: errorMovimiento?.message ?? "No se pudo guardar el movimiento." };
  }

  const { error: errorSocio } = await supabase.from("movimientos_socio").insert({
    socio_id: socioId,
    tipo,
    monto,
    moneda,
    fecha,
    notas,
    cuenta_id: cuentaId,
    movimiento_financiero_id: movimiento.id,
  });
  if (errorSocio) {
    return { error: `Se guardó en Finanzas, pero no se pudo ligar al socio: ${errorSocio.message}` };
  }

  revalidatePath("/finanzas/socios");
  revalidatePath("/finanzas");
  revalidatePath("/finanzas/movimientos");
  return { error: null };
}

export async function agregarPrestamista(formData: FormData) {
  const supabase = await createClient();
  const nombre = texto(formData, "nombre");
  if (!nombre) return;
  await supabase.from("prestamistas").insert({ nombre, notas: texto(formData, "notas") });
  revalidatePath("/finanzas/prestamistas");
}

/** Un préstamo recibido o un pago hecho a un prestamista — genera su
 * movimiento real en Finanzas (Entrada "Préstamo recibido" o Salida "Pago
 * préstamo") en la misma operación. */
export async function registrarMovimientoPrestamista(formData: FormData) {
  const supabase = await createClient();

  const prestamistaId = formData.get("prestamista_id") as string;
  const tipo = formData.get("tipo") as "PRESTAMO" | "PAGO";
  const cuentaId = formData.get("cuenta_id") as string;
  const monto = Number(formData.get("monto"));
  const moneda = (formData.get("moneda") as Moneda) || "MXN";
  const notas = texto(formData, "notas");

  if (!prestamistaId || !cuentaId || !Number.isFinite(monto) || monto <= 0) {
    return { error: "Falta el prestamista, la cuenta o el monto no es válido." };
  }

  const fechaCampo = formData.get("fecha");
  const fecha =
    typeof fechaCampo === "string" && fechaCampo
      ? new Date(`${fechaCampo}T12:00:00`).toISOString()
      : new Date().toISOString();

  const { data: categoria } = await supabase
    .from("categorias_financieras")
    .select("id")
    .eq("nombre", tipo === "PRESTAMO" ? "Préstamo recibido" : "Pago préstamo")
    .maybeSingle<{ id: string }>();

  const { data: movimiento, error: errorMovimiento } = await supabase
    .from("movimientos_financieros")
    .insert({
      tipo: tipo === "PRESTAMO" ? "ENTRADA" : "SALIDA",
      cuenta_id: cuentaId,
      categoria_id: categoria?.id ?? null,
      monto,
      moneda,
      fecha,
      notas,
    })
    .select("id")
    .single();
  if (errorMovimiento || !movimiento) {
    return { error: errorMovimiento?.message ?? "No se pudo guardar el movimiento." };
  }

  const { error: errorPrestamista } = await supabase.from("movimientos_prestamista").insert({
    prestamista_id: prestamistaId,
    tipo,
    monto,
    moneda,
    fecha,
    notas,
    cuenta_id: cuentaId,
    movimiento_financiero_id: movimiento.id,
  });
  if (errorPrestamista) {
    return { error: `Se guardó en Finanzas, pero no se pudo ligar al prestamista: ${errorPrestamista.message}` };
  }

  revalidatePath("/finanzas/prestamistas");
  revalidatePath("/finanzas");
  revalidatePath("/finanzas/movimientos");
  return { error: null };
}

/** Un cargo de deuda con un proveedor (ej. el costo de un pedido nuevo) es
 * solo informativo — no mueve dinero de ninguna cuenta todavía, por eso no
 * genera movimiento en Finanzas (mismo principio que registros_ganancia de
 * Maaser). */
export async function agregarCargoProveedor(formData: FormData) {
  const supabase = await createClient();
  const proveedor = texto(formData, "proveedor");
  const monto = Number(formData.get("monto"));
  const moneda = (formData.get("moneda") as Moneda) || "USD";
  if (!proveedor) return { error: "Falta el proveedor." };
  if (!Number.isFinite(monto) || monto <= 0) return { error: "El monto no es válido." };

  const fechaCampo = formData.get("fecha");
  const fecha =
    typeof fechaCampo === "string" && fechaCampo
      ? new Date(`${fechaCampo}T12:00:00`).toISOString()
      : new Date().toISOString();

  const fechaLimiteCampo = formData.get("fecha_limite");
  const fechaLimite =
    typeof fechaLimiteCampo === "string" && fechaLimiteCampo
      ? new Date(`${fechaLimiteCampo}T12:00:00`).toISOString()
      : null;

  const { error } = await supabase.from("movimientos_deuda_proveedor").insert({
    proveedor,
    tipo: "CARGO",
    monto,
    moneda,
    fecha,
    fecha_limite: fechaLimite,
    notas: texto(formData, "notas"),
  });
  if (error) return { error: error.message };

  revalidatePath("/finanzas/proveedores");
  return { error: null };
}

/** Un envío desde una cuenta puente (ej. Jaim T., el encargado financiero
 * que le manda dinero a China) hacia un proveedor específico — el peso y
 * el dólar pueden no coincidir 1 a 1 porque hay una conversión + comisión
 * de por medio en esa transacción exacta. En una sola captura: sale la
 * salida real de la cuenta puente en Finanzas, se abona a la deuda de ese
 * proveedor (en SU moneda), y si se liga a un contenedor, se registra el
 * abono de mercancía con el tipo de cambio efectivo de esa transacción
 * (incluye la comisión — mismo principio que flete/aduana: es costo
 * directo de traer la mercancía). */
export async function registrarEnvioCuentaPuente(formData: FormData) {
  const supabase = await createClient();

  const cuentaId = formData.get("cuenta_id") as string;
  const proveedor = texto(formData, "proveedor");
  const montoPesos = Number(formData.get("monto_pesos"));
  const comisionPesos = Number(formData.get("comision_pesos")) || 0;
  const montoAbono = Number(formData.get("monto_abono"));
  const monedaProveedor = (formData.get("moneda_proveedor") as Moneda) || "USD";
  const montoDolares = formData.get("monto_dolares") ? Number(formData.get("monto_dolares")) : null;
  const contenedorId = texto(formData, "contenedor_id");
  // Abono "Pendiente" del contenedor (crédito del proveedor) al que se le
  // aplica este pago: se marca pagado con el tipo de cambio real en vez
  // de crear un abono nuevo (que duplicaría los dólares en el promedio).
  const abonoPendienteId = texto(formData, "abono_pendiente_id");
  const notas = texto(formData, "notas");

  if (!cuentaId) return { error: "Elige de qué cuenta puente sale." };
  if (!proveedor) return { error: "Elige a qué proveedor va." };
  if (!Number.isFinite(montoPesos) || montoPesos <= 0) return { error: "El monto en pesos no es válido." };
  if (!Number.isFinite(montoAbono) || montoAbono <= 0) return { error: "El monto a abonar no es válido." };

  const totalPesos = montoPesos + comisionPesos;
  const fechaCampo = formData.get("fecha");
  const fecha =
    typeof fechaCampo === "string" && fechaCampo
      ? new Date(`${fechaCampo}T12:00:00`).toISOString()
      : new Date().toISOString();

  const { data: categoria } = await supabase
    .from("categorias_financieras")
    .select("id")
    .eq("nombre", "Pago proveedor")
    .maybeSingle<{ id: string }>();

  const { data: movimiento, error: errorMovimiento } = await supabase
    .from("movimientos_financieros")
    .insert({
      tipo: "SALIDA",
      cuenta_id: cuentaId,
      categoria_id: categoria?.id ?? null,
      monto: totalPesos,
      moneda: "MXN",
      fecha,
      contraparte: proveedor,
      notas,
    })
    .select("id")
    .single();
  if (errorMovimiento || !movimiento) {
    return { error: errorMovimiento?.message ?? "No se pudo guardar el movimiento." };
  }

  const { error: errorAbono } = await supabase.from("movimientos_deuda_proveedor").insert({
    proveedor,
    tipo: "ABONO",
    monto: montoAbono,
    moneda: monedaProveedor,
    fecha,
    notas,
    cuenta_id: cuentaId,
    movimiento_financiero_id: movimiento.id,
  });
  if (errorAbono) {
    return { error: `Se guardó en Finanzas, pero no se pudo ligar al proveedor: ${errorAbono.message}` };
  }

  if (contenedorId && montoDolares && montoDolares > 0) {
    const { error: errorPago } = abonoPendienteId
      ? await supabase
          .from("pagos_mercancia")
          .update({
            monto_dolares: montoDolares,
            tipo_cambio: totalPesos / montoDolares,
            pagado: true,
            fecha,
            notas,
            cuenta_id: cuentaId,
            movimiento_financiero_id: movimiento.id,
          })
          .eq("id", abonoPendienteId)
          .eq("contenedor_id", contenedorId)
      : await supabase.from("pagos_mercancia").insert({
          contenedor_id: contenedorId,
          monto_dolares: montoDolares,
          tipo_cambio: totalPesos / montoDolares,
          pagado: true,
          fecha,
          notas,
          cuenta_id: cuentaId,
          movimiento_financiero_id: movimiento.id,
        });
    if (errorPago) {
      return { error: `Se guardó el abono, pero no se pudo ligar al contenedor: ${errorPago.message}` };
    }
    await recalcularCostoEntradasContenedor(contenedorId);
    revalidatePath(`/contenedores/${contenedorId}`);
  }

  revalidatePath("/finanzas/proveedores");
  revalidatePath("/finanzas");
  revalidatePath("/finanzas/movimientos");
  return { error: null, movimientoId: movimiento.id };
}

// ---------------------------------------------------------------------------
// "Mandar dinero a China" (una sola captura, comisión ahora o después)
// ---------------------------------------------------------------------------

function comisionDe(formData: FormData, montoPesos: number): number | null {
  const modo = texto(formData, "comision_modo");
  const valor = Number(formData.get("comision_valor"));
  if (modo === "PORCENTAJE") return Number.isFinite(valor) ? Math.round(montoPesos * valor) / 100 : null;
  if (modo === "MONTO") return Number.isFinite(valor) ? valor : null;
  if (modo === "NETO") return Number.isFinite(valor) && valor > 0 ? Math.round((montoPesos - valor) * 100) / 100 : null;
  return null; // "DESPUES"
}

/** Registra el envío al proveedor desde la cuenta puente (o la de origen si
 * fue directo) y cierra el pendiente. */
async function completarEnvioChinaInterno(
  supabase: Awaited<ReturnType<typeof createClient>>,
  envio: EnvioChina,
  comisionPesos: number,
  montoDolares: number | null,
  fechaIso?: string,
) {
  if (comisionPesos < 0 || comisionPesos >= envio.monto_pesos) return { error: "La comisión no es válida." };
  const pesosNetos = Math.round((envio.monto_pesos - comisionPesos) * 100) / 100;
  if (envio.moneda_proveedor === "USD" && !(montoDolares && montoDolares > 0)) {
    return { error: "Pon los dólares que le llegaron al proveedor." };
  }
  const fd = new FormData();
  fd.set("cuenta_id", envio.cuenta_puente_id ?? envio.cuenta_origen_id ?? "");
  fd.set("proveedor", envio.proveedor);
  fd.set("monto_pesos", String(pesosNetos));
  fd.set("comision_pesos", String(comisionPesos));
  fd.set("moneda_proveedor", envio.moneda_proveedor);
  fd.set("monto_abono", String(envio.moneda_proveedor === "USD" ? montoDolares : pesosNetos));
  if (montoDolares && montoDolares > 0) fd.set("monto_dolares", String(montoDolares));
  if (envio.contenedor_id) fd.set("contenedor_id", envio.contenedor_id);
  if (envio.abono_pendiente_id) fd.set("abono_pendiente_id", envio.abono_pendiente_id);
  fd.set("fecha", (fechaIso ?? envio.fecha).slice(0, 10));
  if (envio.notas) fd.set("notas", envio.notas);
  const r = await registrarEnvioCuentaPuente(fd);
  if (r.error) return { error: r.error };
  const { error } = await supabase
    .from("envios_china")
    .update({ estado: "COMPLETADO", comision_pesos: comisionPesos, monto_dolares: montoDolares, completado_en: new Date().toISOString(), movimiento_envio_id: r.movimientoId ?? null })
    .eq("id", envio.id);
  if (error) return { error: error.message };
  return { error: null };
}

/** Un solo botón para el caso más frecuente de Isaac: mandar pesos a un
 * proveedor chino, casi siempre a través de Jaime (cuenta puente).
 * - A través de alguien: hoy sale la TRANSFERENCIA origen → puente por el
 *   monto completo (sin comisión: la comisión se absorbe al costo cuando se
 *   confirma el envío). Si ya sabe la comisión, se completa al instante; si
 *   no, queda un pendiente ámbar hasta que llegue el recibo.
 * - Directo: se registra completo desde la cuenta de origen (necesita la comisión). */
export async function mandarDineroChina(formData: FormData) {
  const supabase = await createClient();
  const cuentaOrigenId = texto(formData, "cuenta_origen_id");
  const via = texto(formData, "via") === "DIRECTO" ? "DIRECTO" : "PUENTE";
  const cuentaPuenteId = via === "PUENTE" ? texto(formData, "cuenta_puente_id") : null;
  const montoPesos = Number(formData.get("monto_pesos"));
  const proveedor = texto(formData, "proveedor");
  const monedaProveedor = (texto(formData, "moneda_proveedor") as Moneda) || "USD";
  const contenedorId = texto(formData, "contenedor_id");
  const abonoPendienteId = texto(formData, "abono_pendiente_id");
  const montoDolaresCampo = Number(formData.get("monto_dolares"));
  const montoDolares = Number.isFinite(montoDolaresCampo) && montoDolaresCampo > 0 ? montoDolaresCampo : null;
  const facturaId = texto(formData, "factura_id");
  const notas = texto(formData, "notas");
  const fechaCampo = texto(formData, "fecha");
  const fecha = fechaCampo ? new Date(`${fechaCampo}T12:00:00`).toISOString() : new Date().toISOString();

  if (!cuentaOrigenId) return { error: "Elige de qué cuenta sale el dinero." };
  if (via === "PUENTE" && !cuentaPuenteId) return { error: "Elige a través de quién va (la cuenta puente)." };
  if (via === "PUENTE" && cuentaPuenteId === cuentaOrigenId) return { error: "La cuenta puente debe ser distinta a la de origen." };
  if (!Number.isFinite(montoPesos) || montoPesos <= 0) return { error: "El monto no es válido." };
  if (!proveedor) return { error: "Escribe a qué proveedor va." };
  const comisionPesos = comisionDe(formData, montoPesos);
  if (comisionPesos === null && via === "DIRECTO") return { error: "Si es directo, pon la comisión (o 0). “La sé después” solo aplica cuando va a través de alguien." };
  if (comisionPesos !== null && (comisionPesos < 0 || comisionPesos >= montoPesos)) return { error: "La comisión no es válida." };

  let movimientoTransferenciaId: string | null = null;
  if (via === "PUENTE") {
    const { data: mov, error } = await supabase
      .from("movimientos_financieros")
      .insert({
        tipo: "TRANSFERENCIA",
        cuenta_id: cuentaOrigenId,
        cuenta_destino_id: cuentaPuenteId,
        categoria_id: null,
        monto: montoPesos,
        moneda: "MXN",
        fecha,
        contraparte: proveedor,
        notas: notas ?? `Para ${proveedor} (vía cuenta puente)`,
        referencia_tipo: facturaId ? "FACTURA" : "ENVIO_CHINA",
        referencia_id: facturaId ?? null,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !mov) return { error: error?.message ?? "No se pudo registrar la transferencia." };
    movimientoTransferenciaId = mov.id;
    if (facturaId) {
      const { error: errorPago } = await supabase.from("pagos_factura").insert({
        factura_id: facturaId,
        monto: comisionPesos !== null ? montoPesos - comisionPesos : montoPesos,
        fecha,
        cuenta_id: cuentaOrigenId,
        categoria_id: null,
        notas,
        movimiento_financiero_id: mov.id,
      });
      if (errorPago) return { error: `Se registró la transferencia, pero no se pudo ligar a la factura: ${errorPago.message}` };
    }
  }

  const { data: envio, error: errorEnvio } = await supabase
    .from("envios_china")
    .insert({
      cuenta_origen_id: cuentaOrigenId,
      cuenta_puente_id: cuentaPuenteId,
      movimiento_transferencia_id: movimientoTransferenciaId,
      proveedor,
      moneda_proveedor: monedaProveedor,
      contenedor_id: contenedorId,
      abono_pendiente_id: abonoPendienteId,
      monto_pesos: montoPesos,
      monto_dolares: montoDolares,
      fecha,
      notas,
    })
    .select("*")
    .single<EnvioChina>();
  if (errorEnvio || !envio) return { error: errorEnvio?.message ?? "No se pudo guardar el envío (¿falta el SQL 0036?)." };

  if (comisionPesos !== null) {
    const r = await completarEnvioChinaInterno(supabase, envio, comisionPesos, montoDolares, fecha);
    if (r.error) return { error: `Quedó como pendiente: ${r.error}` };
  }
  revalidarFinanzas();
  revalidatePath("/finanzas/proveedores");
  return { error: null, pendiente: comisionPesos === null };
}

/** Llegó el recibo: Isaac pone la comisión (y los dólares) y se completa. */
export async function completarEnvioChina(envioId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: envio } = await supabase.from("envios_china").select("*").eq("id", envioId).maybeSingle<EnvioChina>();
  if (!envio) return { error: "No se encontró el envío." };
  if (envio.estado !== "PENDIENTE") return { error: "Este envío ya se completó." };
  const comisionPesos = comisionDe(formData, envio.monto_pesos);
  if (comisionPesos === null) return { error: "Pon la comisión (puede ser 0)." };
  const dolaresCampo = Number(formData.get("monto_dolares"));
  const montoDolares = Number.isFinite(dolaresCampo) && dolaresCampo > 0 ? dolaresCampo : envio.monto_dolares;
  const fechaCampo = texto(formData, "fecha");
  const r = await completarEnvioChinaInterno(supabase, envio, comisionPesos, montoDolares, fechaCampo ? new Date(`${fechaCampo}T12:00:00`).toISOString() : undefined);
  if (r.error) return r;
  revalidarFinanzas();
  revalidatePath("/finanzas/proveedores");
  return { error: null };
}

/** Cancelar un envío pendiente: borra la transferencia a la cuenta puente
 * (y su pago de factura ligado, si lo hubo). Solo mientras está pendiente. */
export async function cancelarEnvioChina(envioId: string) {
  const supabase = await createClient();
  const { data: envio } = await supabase.from("envios_china").select("*").eq("id", envioId).maybeSingle<EnvioChina>();
  if (!envio) return { error: "No se encontró el envío." };
  if (envio.estado !== "PENDIENTE") return { error: "Solo se puede cancelar un envío pendiente." };
  if (envio.movimiento_transferencia_id) {
    await supabase.from("pagos_factura").delete().eq("movimiento_financiero_id", envio.movimiento_transferencia_id);
    await supabase.from("movimientos_financieros").delete().eq("id", envio.movimiento_transferencia_id);
  }
  const { error } = await supabase.from("envios_china").update({ estado: "CANCELADO", completado_en: new Date().toISOString() }).eq("id", envioId);
  if (error) return { error: error.message };
  revalidarFinanzas();
  return { error: null };
}

/** Llegó el dato de la comisión de un movimiento marcado "la sé después":
 * el movimiento baja al neto, la comisión se separa como gasto en
 * "Comisiones" (ligada), y si el movimiento era pago de factura, el abono a
 * la factura también baja al neto. */
export async function completarComisionMovimiento(movimientoId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: m } = await supabase.from("movimientos_financieros").select("*").eq("id", movimientoId).maybeSingle<MovimientoFinanciero>();
  if (!m) return { error: "No se encontró el movimiento." };
  if (!m.comision_pendiente) return { error: "Este movimiento ya tiene su comisión." };
  const comision = comisionDe(formData, m.monto);
  if (comision === null) return { error: "Pon la comisión." };
  if (comision < 0 || comision >= m.monto) return { error: "La comisión no es válida." };
  const neto = Math.round((m.monto - comision) * 100) / 100;

  if (comision > 0) {
    const { data: categoriaComisiones } = await supabase.from("categorias_financieras").select("id").eq("nombre", "Comisiones").maybeSingle<{ id: string }>();
    const { error: errorComision } = await supabase.from("movimientos_financieros").insert({
      tipo: "SALIDA",
      cuenta_id: m.cuenta_id,
      categoria_id: categoriaComisiones?.id ?? null,
      monto: comision,
      moneda: m.moneda,
      fecha: m.fecha,
      contraparte: m.contraparte,
      notas: "Comisión de la transacción",
      referencia_tipo: "COMISION",
      referencia_id: m.id,
    });
    if (errorComision) return { error: errorComision.message };
  }
  const { error } = await supabase.from("movimientos_financieros").update({ monto: neto, comision_pendiente: false }).eq("id", m.id);
  if (error) return { error: error.message };
  if (comision > 0) await supabase.from("pagos_factura").update({ monto: neto }).eq("movimiento_financiero_id", m.id);
  revalidarFinanzas();
  revalidatePath("/finanzas/facturas");
  return { error: null };
}

/** Un abono a un proveedor sí es dinero real: genera su salida en Finanzas
 * (categoría "Pago proveedor") en la misma operación. */
export async function registrarAbonoProveedor(formData: FormData) {
  const supabase = await createClient();

  const proveedor = texto(formData, "proveedor");
  // Cuenta vacía = "Sin cuenta (fue antes de usar el sistema)": el pago ya
  // había salido de verdad antes de capturar saldos aquí, así que solo se
  // baja la deuda del proveedor sin tocar ninguna cuenta de Finanzas
  // (mismo espíritu que el pago "sin cuenta" de facturas, migración 0025).
  const cuentaId = texto(formData, "cuenta_id");
  const monto = Number(formData.get("monto"));
  const moneda = (formData.get("moneda") as Moneda) || "USD";
  const notas = texto(formData, "notas");

  if (!proveedor || !Number.isFinite(monto) || monto <= 0) {
    return { error: "Falta el proveedor o el monto no es válido." };
  }

  const fechaCampo = formData.get("fecha");
  const fecha =
    typeof fechaCampo === "string" && fechaCampo
      ? new Date(`${fechaCampo}T12:00:00`).toISOString()
      : new Date().toISOString();

  if (!cuentaId) {
    const { error: errorHistorico } = await supabase.from("movimientos_deuda_proveedor").insert({
      proveedor,
      tipo: "ABONO",
      monto,
      moneda,
      fecha,
      notas: notas ?? "Pago de antes de usar el sistema (sin cuenta)",
      cuenta_id: null,
      movimiento_financiero_id: null,
    });
    if (errorHistorico) return { error: errorHistorico.message };
    revalidatePath("/finanzas/proveedores");
    revalidatePath("/finanzas");
    return { error: null };
  }

  const { data: categoria } = await supabase
    .from("categorias_financieras")
    .select("id")
    .eq("nombre", "Pago proveedor")
    .maybeSingle<{ id: string }>();

  const { data: movimiento, error: errorMovimiento } = await supabase
    .from("movimientos_financieros")
    .insert({
      tipo: "SALIDA",
      cuenta_id: cuentaId,
      categoria_id: categoria?.id ?? null,
      monto,
      moneda,
      fecha,
      contraparte: proveedor,
      notas,
    })
    .select("id")
    .single();
  if (errorMovimiento || !movimiento) {
    return { error: errorMovimiento?.message ?? "No se pudo guardar el movimiento." };
  }

  const { error: errorAbono } = await supabase.from("movimientos_deuda_proveedor").insert({
    proveedor,
    tipo: "ABONO",
    monto,
    moneda,
    fecha,
    notas,
    cuenta_id: cuentaId,
    movimiento_financiero_id: movimiento.id,
  });
  if (errorAbono) {
    return { error: `Se guardó en Finanzas, pero no se pudo ligar al proveedor: ${errorAbono.message}` };
  }

  revalidatePath("/finanzas/proveedores");
  revalidatePath("/finanzas");
  revalidatePath("/finanzas/movimientos");
  return { error: null };
}

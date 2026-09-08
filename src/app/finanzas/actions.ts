"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { texto } from "@/lib/form-helpers";
import type { Moneda, TipoCuentaFinanciera, TipoMovimientoFinanciero } from "@/lib/tipos";

export async function agregarCuenta(formData: FormData) {
  const supabase = await createClient();
  const nombre = texto(formData, "nombre");
  const tipo = (texto(formData, "tipo") as TipoCuentaFinanciera) ?? "OTRO";
  if (!nombre) return;

  await supabase.from("cuentas_financieras").insert({ nombre, tipo });

  revalidatePath("/finanzas");
  revalidatePath("/finanzas/cuentas");
}

export async function eliminarCuenta(cuentaId: string) {
  const supabase = await createClient();
  await supabase.from("cuentas_financieras").update({ eliminado_en: new Date().toISOString() }).eq("id", cuentaId);
  revalidatePath("/finanzas");
  revalidatePath("/finanzas/cuentas");
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
export async function registrarMovimiento(formData: FormData) {
  const supabase = await createClient();

  const tipo = formData.get("tipo") as TipoMovimientoFinanciero;
  const cuentaId = formData.get("cuenta_id") as string;
  const cuentaDestinoId = formData.get("cuenta_destino_id") as string | null;
  const categoriaId = texto(formData, "categoria_id");
  const monto = Number(formData.get("monto"));
  const moneda = (formData.get("moneda") as Moneda) || "MXN";
  const contraparte = texto(formData, "contraparte");
  const notas = texto(formData, "notas");
  const tieneComision =
    formData.get("tiene_comision") === "true" && (tipo === "SALIDA" || tipo === "TRANSFERENCIA");
  const montoNeto = Number(formData.get("monto_neto"));

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

/** Da de alta una factura pendiente de pagar (proveedor de México, etc.)
 * — todavía no genera ningún movimiento, es solo el recordatorio de que se
 * debe. El movimiento real se crea hasta que se marca "Pagada". */
export async function agregarFactura(formData: FormData) {
  const supabase = await createClient();

  const proveedor = texto(formData, "proveedor");
  const concepto = texto(formData, "concepto");
  const monto = Number(formData.get("monto"));
  const moneda = (formData.get("moneda") as Moneda) || "MXN";
  const notas = texto(formData, "notas");

  if (!proveedor || !Number.isFinite(monto) || monto <= 0) return;

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

  await supabase.from("facturas_pendientes").insert({
    proveedor,
    concepto,
    monto,
    moneda,
    fecha_emision: fechaEmision,
    fecha_limite: fechaLimite,
    notas,
  });

  revalidatePath("/finanzas/facturas");
}

/** Marca una factura como pagada y genera su salida en Finanzas en la
 * misma operación — la factura guarda el id del movimiento que generó, así
 * que nunca hay dos registros sueltos que "deberían" coincidir. Si falla
 * guardar el movimiento, la factura se queda como pendiente. */
export async function marcarFacturaPagada(facturaId: string, formData: FormData) {
  const supabase = await createClient();

  const { data: factura } = await supabase
    .from("facturas_pendientes")
    .select("*")
    .eq("id", facturaId)
    .maybeSingle<{ proveedor: string; concepto: string | null; monto: number; moneda: Moneda }>();
  if (!factura) return { error: "No se encontró la factura." };

  const cuentaId = formData.get("cuenta_id") as string;
  const categoriaId = texto(formData, "categoria_id");
  if (!cuentaId) return { error: "Elige de qué cuenta sale el pago." };

  const fechaCampo = formData.get("fecha_pago");
  const fecha =
    typeof fechaCampo === "string" && fechaCampo
      ? new Date(`${fechaCampo}T12:00:00`).toISOString()
      : new Date().toISOString();

  const { data: movimiento, error: errorMovimiento } = await supabase
    .from("movimientos_financieros")
    .insert({
      tipo: "SALIDA",
      cuenta_id: cuentaId,
      categoria_id: categoriaId,
      monto: factura.monto,
      moneda: factura.moneda,
      fecha,
      contraparte: factura.proveedor,
      notas: factura.concepto,
      referencia_tipo: "FACTURA",
      referencia_id: facturaId,
    })
    .select("id")
    .single();

  if (errorMovimiento || !movimiento) {
    return { error: errorMovimiento?.message ?? "No se pudo guardar el pago." };
  }

  const { error: errorFactura } = await supabase
    .from("facturas_pendientes")
    .update({ pagada: true, movimiento_financiero_id: movimiento.id })
    .eq("id", facturaId);
  if (errorFactura) {
    return { error: `El pago se guardó en Finanzas, pero no se pudo marcar la factura: ${errorFactura.message}` };
  }

  revalidatePath("/finanzas/facturas");
  revalidatePath("/finanzas");
  revalidatePath("/finanzas/movimientos");
  return { error: null };
}

/** Solo se puede borrar una factura que todavía no se ha pagado — una ya
 * pagada tiene un movimiento real ligado y borrarla dejaría ese gasto sin
 * explicación. */
export async function eliminarFactura(facturaId: string) {
  const supabase = await createClient();
  await supabase.from("facturas_pendientes").delete().eq("id", facturaId).eq("pagada", false);
  revalidatePath("/finanzas/facturas");
}

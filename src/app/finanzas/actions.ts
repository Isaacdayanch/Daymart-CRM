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
 * propias) — la columna vertebral de Finanzas. Cuando es una salida con
 * comisión, el monto que se guarda en el movimiento principal es el neto
 * (lo que de verdad le llegó al destinatario) y la diferencia se guarda
 * como un segundo movimiento en la categoría "Comisiones", ligado al
 * primero — juntos suman el total que de verdad salió de la cuenta, sin
 * inflar ni duplicar nada. */
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
  const tieneComision = formData.get("tiene_comision") === "true" && tipo === "SALIDA";
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

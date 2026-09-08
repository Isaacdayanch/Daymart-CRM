"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { texto } from "@/lib/form-helpers";
import type { TipoCuentaFinanciera } from "@/lib/tipos";

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

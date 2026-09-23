"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { texto } from "@/lib/form-helpers";
import { obtenerPerfilActual } from "@/lib/perfil";

async function esDueno() {
  const perfil = await obtenerPerfilActual();
  return perfil?.rol === "dueno";
}

function refrescar() {
  revalidatePath("/stock/catalogo");
  revalidatePath("/stock");
  revalidatePath("/contenedores");
}

const CODIGO_VALIDO = /^[A-Z0-9]{2,4}$/;

export async function crearMarca(formData: FormData) {
  if (!(await esDueno())) return { error: "Solo el dueño puede editar marcas." };
  const supabase = await createClient();
  const nombre = texto(formData, "nombre");
  const codigo = (texto(formData, "codigo") ?? "").toUpperCase();
  if (!nombre) return { error: "Falta el nombre de la marca." };
  if (!CODIGO_VALIDO.test(codigo)) return { error: "El código debe ser de 2 a 4 letras o números (ej. MAM)." };
  const { error } = await supabase.from("marcas").insert({ nombre, codigo, notas: texto(formData, "notas") });
  if (error) return { error: /duplicate|unique/i.test(error.message) ? "Ya existe una marca con ese nombre o código." : error.message };
  refrescar();
  return { error: null };
}

export async function actualizarMarca(marcaId: string, formData: FormData) {
  if (!(await esDueno())) return { error: "Solo el dueño puede editar marcas." };
  const supabase = await createClient();
  const nombre = texto(formData, "nombre");
  const codigo = (texto(formData, "codigo") ?? "").toUpperCase();
  if (!nombre) return { error: "Falta el nombre de la marca." };
  if (!CODIGO_VALIDO.test(codigo)) return { error: "El código debe ser de 2 a 4 letras o números (ej. MAM)." };
  const { error } = await supabase.from("marcas").update({ nombre, codigo, notas: texto(formData, "notas") }).eq("id", marcaId);
  if (error) return { error: /duplicate|unique/i.test(error.message) ? "Ya existe una marca con ese nombre o código." : error.message };
  refrescar();
  return { error: null };
}

/** Quitar una marca solo si ningún producto la usa (soft delete). */
export async function eliminarMarca(marcaId: string) {
  if (!(await esDueno())) return { error: "Solo el dueño puede editar marcas." };
  const supabase = await createClient();
  const { count } = await supabase.from("productos_catalogo").select("sku", { count: "exact", head: true }).eq("marca_id", marcaId).is("eliminado_en", null);
  if (count) return { error: `No se puede quitar: ${count} producto(s) tienen esta marca. Cámbiales la marca primero.` };
  const { error } = await supabase.from("marcas").update({ eliminado_en: new Date().toISOString() }).eq("id", marcaId);
  if (error) return { error: error.message };
  refrescar();
  return { error: null };
}

/** Edita la ficha de un producto del catálogo (nombre, marca, línea,
 * categoría). El nombre y la marca también se propagan a los movimientos de
 * stock y a los productos de contenedor con ese SKU, para que todo diga lo
 * mismo. El SKU no se cambia desde aquí. */
export async function actualizarProductoCatalogo(sku: string, formData: FormData) {
  if (!(await esDueno())) return { error: "Solo el dueño puede editar el catálogo." };
  const supabase = await createClient();
  const nombre = texto(formData, "nombre");
  if (!nombre) return { error: "Falta el nombre." };
  const marcaId = texto(formData, "marca_id");
  const linea = texto(formData, "linea");
  const categoria = texto(formData, "categoria");
  const { error } = await supabase
    .from("productos_catalogo")
    .update({ nombre, marca_id: marcaId, linea, categoria, actualizado_en: new Date().toISOString() })
    .eq("sku", sku);
  if (error) return { error: error.message };
  await supabase.from("movimientos_stock").update({ nombre }).eq("sku", sku);
  await supabase.from("productos").update({ nombre, marca_id: marcaId, ...(categoria ? { categoria } : {}) }).eq("sku", sku);
  refrescar();
  revalidatePath("/stock/movimientos");
  return { error: null };
}

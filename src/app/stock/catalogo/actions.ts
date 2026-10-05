"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { texto } from "@/lib/form-helpers";
import { obtenerPerfilActual } from "@/lib/perfil";
import { generarTokenAcceso } from "@/lib/catalogo-vendedores";

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
  const descripcion = texto(formData, "descripcion");
  const cambios = { nombre, marca_id: marcaId, linea, categoria, actualizado_en: new Date().toISOString() };
  let { error } = await supabase
    .from("productos_catalogo")
    .update({ ...cambios, descripcion })
    .eq("sku", sku);
  // Sin el SQL 0043 todavía no existe la columna `descripcion`: se guarda
  // lo demás y se avisa.
  if (error && /descripcion/.test(error.message)) {
    ({ error } = await supabase.from("productos_catalogo").update(cambios).eq("sku", sku));
    if (!error && descripcion) return { error: "Se guardó todo menos la descripción: falta correr el SQL 0043 en Supabase." };
  }
  if (error) return { error: error.message };
  await supabase.from("movimientos_stock").update({ nombre }).eq("sku", sku);
  await supabase.from("productos").update({ nombre, marca_id: marcaId, ...(categoria ? { categoria } : {}) }).eq("sku", sku);
  refrescar();
  revalidatePath("/stock/movimientos");
  return { error: null };
}

// ---------- Accesos para vendedores externos (migración 0043) ----------

function refrescarAccesos() {
  revalidatePath("/stock/catalogo");
}

/** Crea un link secreto nuevo para un vendedor. */
export async function crearAccesoCatalogo(formData: FormData) {
  if (!(await esDueno())) return { error: "Solo el dueño puede crear accesos." };
  const nombre = texto(formData, "nombre");
  if (!nombre) return { error: "Ponle un nombre al vendedor (para saber de quién es el link)." };
  const supabase = await createClient();
  const { error } = await supabase.from("accesos_catalogo").insert({ nombre, notas: texto(formData, "notas"), token: generarTokenAcceso() });
  if (error) return { error: /accesos_catalogo/.test(error.message) ? "Falta correr el SQL 0043 en Supabase." : error.message };
  refrescarAccesos();
  return { error: null };
}

/** Corta el acceso: el link deja de funcionar al instante. Se conserva el
 * registro para ver el historial (y poder reactivarlo si fue error). */
export async function cortarAccesoCatalogo(accesoId: string) {
  if (!(await esDueno())) return { error: "Solo el dueño puede cortar accesos." };
  const supabase = await createClient();
  const { error } = await supabase.from("accesos_catalogo").update({ revocado_en: new Date().toISOString() }).eq("id", accesoId);
  if (error) return { error: error.message };
  refrescarAccesos();
  return { error: null };
}

export async function reactivarAccesoCatalogo(accesoId: string) {
  if (!(await esDueno())) return { error: "Solo el dueño puede reactivar accesos." };
  const supabase = await createClient();
  const { error } = await supabase.from("accesos_catalogo").update({ revocado_en: null }).eq("id", accesoId);
  if (error) return { error: error.message };
  refrescarAccesos();
  return { error: null };
}

/** Borra un acceso cortado (ya no se necesita el historial). */
export async function eliminarAccesoCatalogo(accesoId: string) {
  if (!(await esDueno())) return { error: "Solo el dueño puede quitar accesos." };
  const supabase = await createClient();
  const { error } = await supabase.from("accesos_catalogo").delete().eq("id", accesoId).not("revocado_en", "is", null);
  if (error) return { error: error.message };
  refrescarAccesos();
  return { error: null };
}

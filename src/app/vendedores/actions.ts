"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { numero, texto } from "@/lib/form-helpers";
import { obtenerPerfilActual } from "@/lib/perfil";
import { generarTokenAcceso } from "@/lib/catalogo-vendedores";

async function esDueno() {
  const perfil = await obtenerPerfilActual();
  return perfil?.rol === "dueno";
}

function refrescar(id?: string) {
  revalidatePath("/vendedores");
  revalidatePath("/vendedores/precios");
  if (id) revalidatePath(`/vendedores/${id}`);
}

function mensajeError(e: { message: string }) {
  if (/vendedores|comisiones_vendedor_producto|precio_venta/.test(e.message) && /does not exist|schema cache/i.test(e.message)) {
    return "Falta correr el SQL 0044 en Supabase.";
  }
  return e.message;
}

type Comision = { pct: number; fija: number; error?: undefined } | { error: string };

function comisionDeForm(formData: FormData): Comision {
  const pct = numero(formData, "comision_pct");
  const fija = numero(formData, "comision_fija");
  if (pct < 0 || pct > 100) return { error: "El porcentaje de comisión debe estar entre 0 y 100." };
  if (fija < 0) return { error: "La comisión fija no puede ser negativa." };
  return { pct, fija };
}

export async function crearVendedor(formData: FormData) {
  if (!(await esDueno())) return { error: "Solo el dueño puede dar de alta vendedores." };
  const nombre = texto(formData, "nombre");
  if (!nombre) return { error: "Falta el nombre del vendedor." };
  const c = comisionDeForm(formData);
  if (c.error !== undefined) return { error: c.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendedores")
    .insert({
      nombre,
      telefono: texto(formData, "telefono"),
      notas: texto(formData, "notas"),
      comision_pct: c.pct,
      comision_fija: c.fija,
      token_vendedor: generarTokenAcceso(),
      token_clientes: generarTokenAcceso(),
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return { error: mensajeError(error) };
  refrescar();
  return { error: null, id: data.id };
}

export async function actualizarVendedor(id: string, formData: FormData) {
  if (!(await esDueno())) return { error: "Solo el dueño puede editar vendedores." };
  const nombre = texto(formData, "nombre");
  if (!nombre) return { error: "Falta el nombre del vendedor." };
  const c = comisionDeForm(formData);
  if (c.error !== undefined) return { error: c.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("vendedores")
    .update({
      nombre,
      telefono: texto(formData, "telefono"),
      notas: texto(formData, "notas"),
      comision_pct: c.pct,
      comision_fija: c.fija,
      clientes_ven_precios: formData.get("clientes_ven_precios") === "on",
    })
    .eq("id", id);
  if (error) return { error: mensajeError(error) };
  refrescar(id);
  return { error: null };
}

/** Corta el acceso: sus dos links dejan de funcionar al instante. */
export async function cortarAccesoVendedor(id: string) {
  if (!(await esDueno())) return { error: "Solo el dueño puede cortar accesos." };
  const supabase = await createClient();
  const { error } = await supabase.from("vendedores").update({ revocado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: mensajeError(error) };
  refrescar(id);
  return { error: null };
}

export async function reactivarVendedor(id: string) {
  if (!(await esDueno())) return { error: "Solo el dueño puede reactivar accesos." };
  const supabase = await createClient();
  const { error } = await supabase.from("vendedores").update({ revocado_en: null }).eq("id", id);
  if (error) return { error: mensajeError(error) };
  refrescar(id);
  return { error: null };
}

/** Genera links nuevos (los viejos dejan de servir): por si un link se
 * filtró a quien no debía. */
export async function regenerarLinksVendedor(id: string) {
  if (!(await esDueno())) return { error: "Solo el dueño puede cambiar los links." };
  const supabase = await createClient();
  const { error } = await supabase.from("vendedores").update({ token_vendedor: generarTokenAcceso(), token_clientes: generarTokenAcceso() }).eq("id", id);
  if (error) return { error: mensajeError(error) };
  refrescar(id);
  return { error: null };
}

/** Quita al vendedor de la lista (soft delete). Sus links dejan de servir. */
export async function eliminarVendedor(id: string) {
  if (!(await esDueno())) return { error: "Solo el dueño puede quitar vendedores." };
  const supabase = await createClient();
  const { error } = await supabase.from("vendedores").update({ eliminado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: mensajeError(error) };
  refrescar(id);
  return { error: null };
}

// ---------- Comisiones especiales por producto ----------

export async function guardarComisionEspecial(vendedorId: string, formData: FormData) {
  if (!(await esDueno())) return { error: "Solo el dueño puede editar comisiones." };
  const sku = texto(formData, "sku");
  if (!sku) return { error: "Elige un producto." };
  const c = comisionDeForm(formData);
  if (c.error !== undefined) return { error: c.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("comisiones_vendedor_producto")
    .upsert({ vendedor_id: vendedorId, sku, comision_pct: c.pct, comision_fija: c.fija }, { onConflict: "vendedor_id,sku" });
  if (error) return { error: mensajeError(error) };
  refrescar(vendedorId);
  return { error: null };
}

export async function quitarComisionEspecial(vendedorId: string, sku: string) {
  if (!(await esDueno())) return { error: "Solo el dueño puede editar comisiones." };
  const supabase = await createClient();
  const { error } = await supabase.from("comisiones_vendedor_producto").delete().eq("vendedor_id", vendedorId).eq("sku", sku);
  if (error) return { error: mensajeError(error) };
  refrescar(vendedorId);
  return { error: null };
}

// ---------- Lista de precios ----------

/** Guarda el precio de venta (sin IVA) de un producto; vacío = sin precio
 * (deja de salir en los links de los vendedores). */
export async function guardarPrecioVenta(sku: string, precio: number | null) {
  if (!(await esDueno())) return { error: "Solo el dueño puede cambiar precios." };
  if (precio !== null && (!Number.isFinite(precio) || precio < 0)) return { error: "Precio inválido." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("productos_catalogo")
    .update({ precio_venta: precio && precio > 0 ? precio : null, actualizado_en: new Date().toISOString() })
    .eq("sku", sku);
  if (error) return { error: mensajeError(error) };
  revalidatePath("/vendedores/precios");
  return { error: null };
}

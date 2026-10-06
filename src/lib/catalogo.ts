// Catálogo de productos y marcas (migración 0038). Un registro por SKU que
// se alimenta de los contenedores, las altas manuales y Mercado Libre.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Marca, ProductoCatalogo } from "./tipos";

export async function obtenerMarcas(supabase: SupabaseClient): Promise<Marca[]> {
  const { data } = await supabase.from("marcas").select("*").is("eliminado_en", null).order("nombre").returns<Marca[]>();
  return data ?? [];
}

export async function obtenerCatalogo(supabase: SupabaseClient): Promise<ProductoCatalogo[]> {
  const { data } = await supabase.from("productos_catalogo").select("*").is("eliminado_en", null).order("nombre").returns<ProductoCatalogo[]>();
  return data ?? [];
}

export interface DatosCatalogo {
  sku: string;
  nombre: string;
  marca_id?: string | null;
  linea?: string | null;
  categoria?: string | null;
  imagen_url?: string | null;
  piezas_por_caja?: number | null;
  largo_cm?: number | null;
  ancho_cm?: number | null;
  alto_cm?: number | null;
  memo?: string | null;
  peso_kg?: number | null;
}

/** Crea o actualiza la ficha del producto. Solo pisa los campos que vienen
 * con valor (un alta manual sin medidas no borra las medidas que ya tenía
 * la ficha). Nunca truena la operación principal: si la tabla no existe
 * todavía (falta el SQL 0038), devuelve el error para avisar, nada más. */
export async function guardarEnCatalogo(supabase: SupabaseClient, datos: DatosCatalogo) {
  // `eliminado_en: null` revive la ficha si el SKU se había quitado de Stock
  // y se vuelve a dar de alta.
  const fila: Record<string, unknown> = { sku: datos.sku, nombre: datos.nombre, actualizado_en: new Date().toISOString(), eliminado_en: null };
  const opcionales: (keyof DatosCatalogo)[] = ["marca_id", "linea", "categoria", "imagen_url", "piezas_por_caja", "largo_cm", "ancho_cm", "alto_cm", "memo", "peso_kg"];
  for (const campo of opcionales) {
    const v = datos[campo];
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "number" && v === 0 && campo !== "piezas_por_caja") continue;
    fila[campo] = v;
  }
  let { error } = await supabase.from("productos_catalogo").upsert(fila, { onConflict: "sku" });
  // Sin el SQL 0047 (peso_kg) la ficha se guarda igual, solo sin peso.
  if (error && /peso_kg/.test(error.message) && "peso_kg" in fila) {
    delete fila.peso_kg;
    ({ error } = await supabase.from("productos_catalogo").upsert(fila, { onConflict: "sku" }));
  }
  return { error: error?.message ?? null };
}

/** SKUs que ya existen en cualquier lado (catálogo, productos de
 * contenedor, movimientos) para no repetir uno nuevo. */
export async function skusExistentes(supabase: SupabaseClient): Promise<Set<string>> {
  const [{ data: cat }, { data: prods }, { data: movs }] = await Promise.all([
    supabase.from("productos_catalogo").select("sku").is("eliminado_en", null),
    supabase.from("productos").select("sku"),
    supabase.from("movimientos_stock").select("sku"),
  ]);
  const set = new Set<string>();
  for (const lista of [cat, prods, movs]) for (const r of (lista ?? []) as { sku: string }[]) set.add(r.sku);
  return set;
}

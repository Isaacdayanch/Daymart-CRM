// Catálogo de productos y marcas (migración 0038). Un registro por SKU que
// se alimenta de los contenedores, las altas manuales y Mercado Libre.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sinColumnasFaltantes } from "./columnas-faltantes";
import { todasLasFilas } from "./cargar-todo";
import type { Marca, ProductoCatalogo } from "./tipos";

export async function obtenerMarcas(supabase: SupabaseClient): Promise<Marca[]> {
  const { data } = await supabase.from("marcas").select("*").is("eliminado_en", null).order("nombre").returns<Marca[]>();
  return data ?? [];
}

export async function obtenerCatalogo(supabase: SupabaseClient): Promise<ProductoCatalogo[]> {
  const { data } = await todasLasFilas<ProductoCatalogo>((d, h) => supabase.from("productos_catalogo").select("*", { count: "exact" }).is("eliminado_en", null).order("nombre").order("sku").range(d, h));
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
  /** Mancuernas (migración 0053). `es_mancuerna` sí se guarda aunque sea
   * false (para poder desmarcarla); los demás solo si traen valor. */
  es_mancuerna?: boolean | null;
  peso_unidad?: number | null;
  unidad_peso?: string | null;
  vendida_en_par?: boolean | null;
  precio_modo?: string | null;
  precio_capturado?: number | null;
  /** Código ML de Full para la etiqueta (0054). */
  codigo_ml?: string | null;
}

/** Crea o actualiza la ficha del producto. Solo pisa los campos que vienen
 * con valor (un alta manual sin medidas no borra las medidas que ya tenía
 * la ficha). Nunca truena la operación principal: si la tabla no existe
 * todavía (falta el SQL 0038), devuelve el error para avisar, nada más. */
export async function guardarEnCatalogo(supabase: SupabaseClient, datos: DatosCatalogo) {
  // `eliminado_en: null` revive la ficha si el SKU se había quitado de Stock
  // y se vuelve a dar de alta.
  const fila: Record<string, unknown> = { sku: datos.sku, nombre: datos.nombre, actualizado_en: new Date().toISOString(), eliminado_en: null };
  const opcionales: (keyof DatosCatalogo)[] = ["marca_id", "linea", "categoria", "imagen_url", "piezas_por_caja", "largo_cm", "ancho_cm", "alto_cm", "memo", "peso_kg", "peso_unidad", "unidad_peso", "precio_modo", "precio_capturado", "codigo_ml"];
  for (const campo of opcionales) {
    const v = datos[campo];
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "number" && v === 0 && campo !== "piezas_por_caja") continue;
    fila[campo] = v;
  }
  // Las casillas de mancuerna sí se guardan en false cuando el formulario
  // las trae (undefined = el formulario no tenía el bloque, no se toca).
  if (datos.es_mancuerna !== undefined && datos.es_mancuerna !== null) fila.es_mancuerna = datos.es_mancuerna;
  if (datos.vendida_en_par !== undefined && datos.vendida_en_par !== null) fila.vendida_en_par = datos.vendida_en_par;
  // Sin el SQL 0047 (peso_kg) o 0053 (mancuernas) la ficha se guarda igual,
  // solo sin esas columnas.
  const { error } = await sinColumnasFaltantes(fila, (f) => supabase.from("productos_catalogo").upsert(f, { onConflict: "sku" }));
  return { error };
}

/** SKUs que ya existen en cualquier lado (catálogo, productos de
 * contenedor, movimientos) para no repetir uno nuevo. */
export async function skusExistentes(supabase: SupabaseClient): Promise<Set<string>> {
  // Paginado: con más de 1,000 movimientos Supabase cortaba en silencio y
  // SKUs viejos "no existían" (y la liga "mismo SKU" no los encontraba).
  const [{ data: cat }, { data: prods }, { data: movs }] = await Promise.all([
    todasLasFilas<{ sku: string }>((d, h) => supabase.from("productos_catalogo").select("sku", { count: "exact" }).is("eliminado_en", null).order("sku").range(d, h)),
    todasLasFilas<{ sku: string }>((d, h) => supabase.from("productos").select("sku", { count: "exact" }).order("id").range(d, h)),
    todasLasFilas<{ sku: string }>((d, h) => supabase.from("movimientos_stock").select("sku", { count: "exact" }).order("id").range(d, h)),
  ]);
  const set = new Set<string>();
  for (const lista of [cat, prods, movs]) for (const r of (lista ?? []) as { sku: string }[]) set.add(r.sku);
  return set;
}

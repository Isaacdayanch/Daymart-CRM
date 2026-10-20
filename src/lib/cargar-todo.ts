// Traer TODAS las filas de una tabla aunque pasen del tope de Supabase.
//
// Supabase (PostgREST) corta cualquier consulta en 1,000 filas por defecto,
// SIN avisar: un `select("*")` sobre `movimientos_stock` con 3,000 filas
// regresa 1,000 y el stock saldría mal en silencio. Las ventas de Mercado
// Libre generan una salida por renglón, así que esa tabla crece rápido.
//
// Aquí se pide la primera página junto con el total (`count: "exact"`, una
// sola llamada) y, solo si hay más, el resto en paralelo — dos vueltas al
// servidor como máximo, sin importar el tamaño. Para que las páginas no se
// traslapen, la consulta SIEMPRE lleva un orden fijo.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MovimientoFinanciero, MovimientoStock } from "./tipos";

export const TAMANO_PAGINA = 1000;

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null; count: number | null }>;

/** `consulta(desde, hasta)` debe armar la consulta con `{ count: "exact" }`,
 * un orden fijo y `.range(desde, hasta)`. Devuelve `{ data, error }` como
 * cualquier consulta de Supabase, para poder reemplazar las existentes sin
 * tocar el resto de la pantalla. */
export async function todasLasFilas<T>(consulta: (desde: number, hasta: number) => Pagina<T>): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const primera = await consulta(0, TAMANO_PAGINA - 1);
  if (primera.error) return { data: null, error: primera.error };
  const filas: T[] = [...(primera.data ?? [])];
  const total = primera.count ?? filas.length;
  if (total <= filas.length) return { data: filas, error: null };
  const faltantes: Pagina<T>[] = [];
  for (let desde = filas.length; desde < total; desde += TAMANO_PAGINA) faltantes.push(consulta(desde, desde + TAMANO_PAGINA - 1));
  for (const r of await Promise.all(faltantes)) {
    if (r.error) return { data: null, error: r.error };
    filas.push(...(r.data ?? []));
  }
  return { data: filas, error: null };
}

/** Todo el libro de movimientos de stock (ordenado por fecha, luego id). */
export function todosLosMovimientosStock(supabase: SupabaseClient) {
  return todasLasFilas<MovimientoStock>((desde, hasta) => supabase.from("movimientos_stock").select("*", { count: "exact" }).order("creado_en", { ascending: true }).order("id", { ascending: true }).range(desde, hasta));
}

/** Todo el libro de movimientos de Finanzas (del más reciente al más viejo,
 * como lo usan las pantallas de Finanzas). */
export function todosLosMovimientosFinancieros(supabase: SupabaseClient) {
  return todasLasFilas<MovimientoFinanciero>((desde, hasta) => supabase.from("movimientos_financieros").select("*", { count: "exact" }).order("fecha", { ascending: false }).order("id", { ascending: true }).range(desde, hasta));
}

import type { SupabaseClient } from "@supabase/supabase-js";

/** Piezas por caja "de verdad" de cada SKU, según la tabla productos (la
 * fuente real) — se usa para que el cálculo de cajas en Stock no dependa
 * de lo que diga un movimiento suelto (que puede haber quedado con un
 * valor viejo o por default). Si un SKU aparece en varios productos
 * (varios contenedores), se usa el del más reciente. */
export async function obtenerPiezasPorCajaPorSku(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data } = await supabase
    .from("productos")
    .select("sku, piezas_por_caja")
    .order("creado_en", { ascending: false })
    .returns<{ sku: string; piezas_por_caja: number }[]>();

  const mapa = new Map<string, number>();
  for (const p of data ?? []) {
    if (!mapa.has(p.sku) && p.piezas_por_caja > 0) mapa.set(p.sku, p.piezas_por_caja);
  }
  return mapa;
}

import { createClient } from "@/lib/supabase/server";
import { resumenPorSku } from "@/lib/calculos-stock";
import { obtenerCatalogo } from "@/lib/catalogo";
import { obtenerPiezasPorCajaPorSku } from "@/lib/productos-stock";
import { agruparPorSkuMl, type ProductoCrmResumen } from "@/lib/mercadolibre-skus";
import { obtenerPublicaciones, obtenerVinculos } from "@/lib/mercadolibre-stock";
import type { ConfiguracionStock, MovimientoStock } from "@/lib/tipos";
import { TablaSkus } from "./tabla-skus";

export const maxDuration = 60;

/** "Ligar SKUs": cada SKU de Mercado Libre → un producto del CRM, una sola
 * vez, para todas sus publicaciones. Los pendientes van arriba con una
 * propuesta por nombre; Isaac elige y liga. */
export default async function LigarSkus() {
  const supabase = await createClient();
  const [{ data: movimientos }, { data: configuracion }, piezasPorCajaPorSku, catalogo] = await Promise.all([
    supabase.from("movimientos_stock").select("*").returns<MovimientoStock[]>(),
    supabase.from("configuracion_stock").select("*").maybeSingle<ConfiguracionStock>(),
    obtenerPiezasPorCajaPorSku(supabase),
    obtenerCatalogo(supabase).catch(() => []),
  ]);
  const resumenes = resumenPorSku(movimientos ?? [], configuracion?.dias_espera ?? 60, piezasPorCajaPorSku);
  const porSku = new Map<string, ProductoCrmResumen>();
  for (const p of catalogo) porSku.set(p.sku, { sku: p.sku, nombre: p.nombre, imagenUrl: p.imagen_url, stockActual: 0 });
  for (const r of resumenes) {
    const previo = porSku.get(r.sku);
    porSku.set(r.sku, { sku: r.sku, nombre: previo?.nombre ?? r.nombre, imagenUrl: previo?.imagenUrl ?? r.imagenUrl, stockActual: r.stockActual });
  }
  const productos = Array.from(porSku.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  let error: string | null = null;
  let grupos: ReturnType<typeof agruparPorSkuMl>["grupos"] = [];
  let sinSku: ReturnType<typeof agruparPorSkuMl>["sinSku"] = [];
  try {
    const [publicaciones, vinculos] = await Promise.all([obtenerPublicaciones(), obtenerVinculos()]);
    ({ grupos, sinSku } = agruparPorSkuMl(publicaciones, vinculos, productos));
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudieron leer las publicaciones.";
  }
  const pendientes = grupos.filter((g) => g.estado === "pendiente").length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Ligar SKUs de Mercado Libre con tus productos</h2>
        <p className="text-sm text-zinc-500">
          Un SKU de ML se liga una sola vez y aplica a todas sus publicaciones (las dos publicaciones de lo mismo llevan el mismo SKU). Ventas, envíos a Full, valor en Full y Análisis de venta usan esta liga. Si pones en ML el mismo SKU que en el CRM, queda ligado solo.
        </p>
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      <TablaSkus grupos={grupos} sinSku={sinSku} productos={productos} pendientes={pendientes} />
    </div>
  );
}

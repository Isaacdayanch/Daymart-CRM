import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { obtenerCatalogo, obtenerMarcas } from "@/lib/catalogo";
import { resumenPorSku } from "@/lib/calculos-stock";
import { obtenerPiezasPorCajaPorSku } from "@/lib/productos-stock";
import type { ConfiguracionStock, MovimientoStock } from "@/lib/tipos";
import { FilaCatalogo } from "./fila-catalogo";
import { Marcas } from "./marcas";

/** Catálogo: la ficha de cada producto (un registro por SKU) y las marcas.
 * Se alimenta solo de contenedores y altas manuales; aquí se corrige
 * nombre, marca, línea y categoría. */
export default async function CatalogoProductos({ searchParams }: { searchParams: Promise<{ q?: string; marca?: string }> }) {
  const { q = "", marca: marcaFiltro = "" } = await searchParams;
  const supabase = await createClient();
  let catalogo: Awaited<ReturnType<typeof obtenerCatalogo>> = [];
  let marcas: Awaited<ReturnType<typeof obtenerMarcas>> = [];
  let faltaSql = false;
  try {
    [catalogo, marcas] = await Promise.all([obtenerCatalogo(supabase), obtenerMarcas(supabase)]);
    const { error } = await supabase.from("productos_catalogo").select("sku", { head: true, count: "exact" });
    if (error) faltaSql = true;
  } catch {
    faltaSql = true;
  }
  const [{ data: movimientos }, { data: configuracion }, piezasPorCajaPorSku] = await Promise.all([
    supabase.from("movimientos_stock").select("*").returns<MovimientoStock[]>(),
    supabase.from("configuracion_stock").select("*").single<ConfiguracionStock>(),
    obtenerPiezasPorCajaPorSku(supabase),
  ]);
  const resumenes = resumenPorSku(movimientos ?? [], configuracion?.dias_espera ?? 60, piezasPorCajaPorSku);
  const stockPorSku = new Map(resumenes.map((r) => [r.sku, r.stockActual]));

  const categorias = Array.from(new Set(catalogo.map((p) => p.categoria).filter((c): c is string => Boolean(c)))).sort();
  const lineas = Array.from(new Set(catalogo.map((p) => p.linea).filter((l): l is string => Boolean(l)))).sort();
  const productosPorMarca: Record<string, number> = {};
  for (const p of catalogo) if (p.marca_id) productosPorMarca[p.marca_id] = (productosPorMarca[p.marca_id] ?? 0) + 1;

  const texto = q.trim().toLowerCase();
  const lista = catalogo
    .filter((p) => (marcaFiltro === "sin" ? !p.marca_id : marcaFiltro ? p.marca_id === marcaFiltro : true))
    .filter((p) => !texto || [p.nombre, p.sku, p.categoria, p.linea].some((t) => t?.toLowerCase().includes(texto)));
  const sinMarca = catalogo.filter((p) => !p.marca_id).length;

  return (
    <div className="space-y-6">
      {faltaSql && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Falta correr el SQL 0038 en Supabase para que exista el catálogo y las marcas.
        </div>
      )}

      <Marcas marcas={marcas} productosPorMarca={productosPorMarca} />

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Catálogo de productos</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Un registro por SKU. Se llena solo desde Contenedores y altas manuales; aquí corriges nombre, marca, línea y categoría.
            {sinMarca > 0 && <> {sinMarca} producto(s) todavía sin marca.</>}
          </p>
          <form className="mt-3 flex flex-wrap items-center gap-2" action="/stock/catalogo">
            <div className="flex overflow-hidden rounded-xl border border-zinc-300 text-xs">
              {[{ valor: "", etiqueta: "Todas" }, ...marcas.map((m) => ({ valor: m.id, etiqueta: m.nombre })), { valor: "sin", etiqueta: `Sin marca${sinMarca ? ` (${sinMarca})` : ""}` }].map((f) => (
                <Link
                  key={f.valor}
                  href={`/stock/catalogo?marca=${f.valor}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                  className={`px-3.5 py-2 ${marcaFiltro === f.valor ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:text-zinc-900"}`}
                >
                  {f.etiqueta}
                </Link>
              ))}
            </div>
            <input type="hidden" name="marca" value={marcaFiltro} />
            <input type="search" name="q" defaultValue={q} placeholder="Buscar por nombre, SKU, categoría o línea…" className="w-full rounded-xl border border-zinc-300 px-3.5 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500 sm:w-80" />
          </form>
        </div>
        <ul className="divide-y divide-zinc-100">
          {lista.map((p) => (
            <FilaCatalogo key={p.sku} producto={p} marcas={marcas} categorias={categorias} lineas={lineas} stock={stockPorSku.get(p.sku) ?? null} />
          ))}
          {lista.length === 0 && <li className="px-5 py-10 text-center text-sm text-zinc-400">{catalogo.length ? "Nada con ese filtro." : "El catálogo está vacío."}</li>}
        </ul>
      </div>
    </div>
  );
}

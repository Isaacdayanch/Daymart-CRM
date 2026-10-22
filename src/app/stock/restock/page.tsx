import Link from "next/link";
import { todosLosMovimientosStock } from "@/lib/cargar-todo";
import { createClient } from "@/lib/supabase/server";
import { resumenPorSku, sugeridosReorden } from "@/lib/calculos-stock";
import { obtenerPerfilActual } from "@/lib/perfil";
import { obtenerCategoriaPorSku, obtenerPiezasPorCajaPorSku } from "@/lib/productos-stock";
import type { ConfiguracionStock, Contenedor } from "@/lib/tipos";
import { cargarDatosFull, resumenFullDesde } from "@/lib/mercadolibre-stock";
import { cargarEnCaminoAFull, enCaminoAFullDesde } from "@/lib/mercadolibre-envios-full";
import { TablaRestock } from "./tabla-restock";

/** Pestaña "Restock": las sugerencias de reorden de Stock en su propio
 * lugar (Isaac, 20 oct: "todas las sugerencias de restock ponlas en una
 * pestaña, que no me estorben cuando entro a ver el panel"). Misma regla
 * de siempre: rotación real de salidas de bodega (90 días) × tiempo de
 * espera = punto de reorden; se sugiere cuando el stock de bodega está en
 * ese punto o abajo, y solo si el producto sí se mueve. */
export default async function RestockPage() {
  const supabase = await createClient();
  const [perfil, { data: movimientos }, { data: configuracion }, piezasPorCajaPorSku, categoriaPorSku, datosFull, enCaminoDatos, { data: enConfiguracion }] = await Promise.all([
    obtenerPerfilActual(),
    todosLosMovimientosStock(supabase),
    supabase.from("configuracion_stock").select("*").maybeSingle<ConfiguracionStock>(),
    obtenerPiezasPorCajaPorSku(supabase),
    obtenerCategoriaPorSku(supabase),
    cargarDatosFull(),
    cargarEnCaminoAFull(),
    supabase.from("contenedores").select("id, numero").eq("estado", "CONFIGURANDOSE").is("eliminado_en", null).order("numero", { ascending: false }).limit(1).maybeSingle<Pick<Contenedor, "id" | "numero">>(),
  ]);
  const verDinero = perfil?.rol !== "operadora";
  const diasEspera = configuracion?.dias_espera ?? 60;
  const resumenes = resumenPorSku(movimientos ?? [], diasEspera, piezasPorCajaPorSku, categoriaPorSku);
  const sugeridos = sugeridosReorden(resumenes);
  // Full y en camino solo como dato extra (dueño): la regla sigue siendo por bodega.
  const full = verDinero ? resumenFullDesde(datosFull, resumenes) : null;
  const enCamino = verDinero ? enCaminoAFullDesde(enCaminoDatos, new Map(resumenes.map((r) => [r.sku, r.costoPromedio]))) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Sugerido reordenar</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Productos cuyo stock en bodega ya no cubre tu tiempo de espera de <strong>{diasEspera} días</strong> (lo que tarda en llegar un pedido nuevo), según sus salidas reales de los últimos 90 días. Del más urgente al que más aguanta.
            {" "}
            <Link href="/stock/configuracion" className="text-[#2D3277] hover:underline">
              Cambiar los días de espera
            </Link>
            {verDinero && (
              <>
                {" · "}
                <Link href="/mercadolibre/analisis" className="text-[#2D3277] hover:underline">
                  Ver el cálculo con ventas de Mercado Libre y Full
                </Link>
              </>
            )}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset ${sugeridos.length ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"}`}>
          {sugeridos.length ? `${sugeridos.length} por pedir` : "Nada por pedir"}
        </span>
      </div>

      {sugeridos.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500 shadow-sm">
          Todo tu stock en bodega cubre los {diasEspera} días de espera al ritmo actual. Aquí aparecerán los productos conforme vayan bajando.
        </div>
      ) : (
        <TablaRestock
          filas={sugeridos.map((r) => ({
            sku: r.sku,
            nombre: r.nombre,
            categoria: r.categoria,
            imagenUrl: r.imagenUrl,
            stockActual: r.stockActual,
            cajas: r.cajas,
            rotacionDiaria: r.rotacionDiaria,
            puntoReorden: r.puntoReorden,
            enFull: full?.porSku.get(r.sku) ?? null,
            enCamino: enCamino?.porSku.get(r.sku) ?? null,
          }))}
          diasEspera={diasEspera}
          conFull={Boolean(full)}
          contenedor={verDinero ? (enConfiguracion ?? null) : undefined}
        />
      )}
    </div>
  );
}

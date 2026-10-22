import Link from "next/link";
import { todosLosMovimientosStock } from "@/lib/cargar-todo";
import { createClient } from "@/lib/supabase/server";
import { resumenPorSku, sugeridosReorden, valorTotalInventario } from "@/lib/calculos-stock";
import { formatoPesos } from "@/lib/formato";
import { obtenerPerfilActual } from "@/lib/perfil";
import { obtenerCategoriaPorSku, obtenerPiezasPorCajaPorSku } from "@/lib/productos-stock";
import type { Bodega, ConfiguracionStock } from "@/lib/tipos";
import { TablaStock } from "./tabla-stock";
import { cargarDatosFull, resumenFullDesde } from "@/lib/mercadolibre-stock";
import { cargarEnCaminoAFull, enCaminoAFullDesde } from "@/lib/mercadolibre-envios-full";

export default async function ResumenStock() {
  const supabase = await createClient();
  // Velocidad: perfil, stock, copia de ML y envíos en camino, todo de una vez.
  const [perfil, { data: movimientos }, { data: bodegas }, { data: configuracion }, { count: pendientesCount }, piezasPorCajaPorSku, categoriaPorSku, datosFull, enCaminoDatos] = await Promise.all([
    obtenerPerfilActual(),
    todosLosMovimientosStock(supabase),
    supabase.from("bodegas").select("*").is("eliminado_en", null).returns<Bodega[]>(),
    supabase.from("configuracion_stock").select("*").single<ConfiguracionStock>(),
    supabase.from("pendientes_china").select("*", { count: "exact", head: true }).eq("estado", "PENDIENTE"),
    obtenerPiezasPorCajaPorSku(supabase),
    obtenerCategoriaPorSku(supabase),
    cargarDatosFull(),
    cargarEnCaminoAFull(),
  ]);
  const verDinero = perfil?.rol !== "operadora";

  const listaMovimientos = movimientos ?? [];
  const diasEspera = configuracion?.dias_espera ?? 60;
  const resumenes = resumenPorSku(listaMovimientos, diasEspera, piezasPorCajaPorSku, categoriaPorSku);
  const categorias = [...new Set(resumenes.map((r) => r.categoria))].sort();
  const valorTotal = valorTotalInventario(resumenes);
  // Las sugerencias de restock viven en su pestaña (/stock/restock); aquí
  // solo un link discreto (Isaac, 20 oct: "que no me estorben cuando entro
  // a ver el panel").
  const porPedir = sugeridosReorden(resumenes).length;
  const bodegasPorId = Object.fromEntries((bodegas ?? []).map((b) => [b.id, b.nombre]));
  // Stock en Full de Mercado Libre (solo dueño; null si no está conectado).
  const full = verDinero ? resumenFullDesde(datosFull, resumenes) : null;
  const fullPorSku = full ? Object.fromEntries(full.porSku) : undefined;
  // Piezas que ya salieron de bodega y van en camino a Full (envíos sin cerrar).
  const enCamino = verDinero ? enCaminoAFullDesde(enCaminoDatos, new Map(resumenes.map((r) => [r.sku, r.costoPromedio]))) : null;
  const enCaminoPorSku = enCamino && enCamino.piezas > 0 ? Object.fromEntries(enCamino.porSku) : undefined;
  const piezasBodega = resumenes.reduce((s, r) => s + r.stockActual, 0);

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <Link
          href="/stock/conteo"
          className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700"
        >
          Revisar inventario →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {verDinero && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Valor de inventario</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">{formatoPesos(valorTotal + (enCamino?.valor ?? 0) + (full?.valor ?? 0))}</p>
            {full ? (
              <p className="mt-1 text-xs text-zinc-400">
                Bodega {formatoPesos(valorTotal)} ({piezasBodega.toLocaleString("es-MX")} pzas)
                {enCamino && enCamino.piezas > 0 && (
                  <>
                    {" + "}
                    <Link href="/stock/full#envios-ml" className="text-[#2D3277] hover:underline">
                      en camino a Full {formatoPesos(enCamino.valor)} ({enCamino.piezas.toLocaleString("es-MX")} pzas)
                    </Link>
                  </>
                )}
                {" + "}Full {formatoPesos(full.valor)} ({full.piezas.toLocaleString("es-MX")} pzas)
                {full.inventariosSinLigar > 0 && (
                  <>
                    {" · "}
                    <Link href="/mercadolibre/stock?filtro=sinligar" className="text-amber-700 hover:underline">
                      {full.inventariosSinLigar} en Full sin ligar
                    </Link>
                  </>
                )}
              </p>
            ) : (
              <p className="mt-1 text-xs text-zinc-400">Lo que tienes hoy, en bodega, a costo real</p>
            )}
          </div>
        )}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">SKUs activos</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
            {resumenes.filter((r) => r.stockActual > 0).length}
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            En {bodegas?.length ?? 0} bodega(s)
            {porPedir > 0 && (
              <>
                {" · "}
                <Link href="/stock/restock" className="font-medium text-amber-700 hover:underline">
                  {porPedir} por pedir →
                </Link>
              </>
            )}
          </p>
        </div>
        <Link
          href="/stock/pendientes"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm transition hover:border-amber-300"
        >
          <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Pendiente en China</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-amber-900">{pendientesCount ?? 0}</p>
          <p className="mt-1 text-xs text-amber-700">Productos por consolidar →</p>
        </Link>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Stock por producto</h2>
        </div>
        {resumenes.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">
            Todavía no hay movimientos de stock. Se generan solos al recibir un contenedor.
          </p>
        ) : (
          <TablaStock
            fullPorSku={fullPorSku}
            enCaminoPorSku={enCaminoPorSku}
            resumenes={resumenes}
            bodegasPorId={bodegasPorId}
            verDinero={verDinero}
            categorias={categorias}
          />
        )}
      </div>
    </div>
  );
}

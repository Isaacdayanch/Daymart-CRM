import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resumenPorSku, valorTotalInventario } from "@/lib/calculos-stock";
import { formatoPesos } from "@/lib/formato";
import type { Bodega, ConfiguracionStock, MovimientoStock } from "@/lib/tipos";

export default async function ResumenStock() {
  const supabase = await createClient();

  const [{ data: movimientos }, { data: bodegas }, { data: configuracion }, { count: pendientesCount }] =
    await Promise.all([
      supabase.from("movimientos_stock").select("*").returns<MovimientoStock[]>(),
      supabase.from("bodegas").select("*").is("eliminado_en", null).returns<Bodega[]>(),
      supabase.from("configuracion_stock").select("*").single<ConfiguracionStock>(),
      supabase.from("pendientes_china").select("*", { count: "exact", head: true }).eq("estado", "PENDIENTE"),
    ]);

  const listaMovimientos = movimientos ?? [];
  const diasEspera = configuracion?.dias_espera ?? 60;
  const resumenes = resumenPorSku(listaMovimientos, diasEspera);
  const valorTotal = valorTotalInventario(resumenes);
  const paraReordenar = resumenes.filter((r) => r.necesitaReorden && r.stockActual > 0);
  const bodegasPorId = new Map((bodegas ?? []).map((b) => [b.id, b.nombre]));

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Valor de inventario</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">{formatoPesos(valorTotal)}</p>
          <p className="mt-1 text-xs text-zinc-400">Lo que tienes hoy, en bodega, a costo real</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">SKUs activos</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
            {resumenes.filter((r) => r.stockActual > 0).length}
          </p>
          <p className="mt-1 text-xs text-zinc-400">En {bodegas?.length ?? 0} bodega(s)</p>
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

      {paraReordenar.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Sugerido reordenar</h2>
            <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-600 ring-1 ring-inset ring-rose-200">
              {paraReordenar.length}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Según su rotación real de salidas y tu tiempo de espera configurado ({diasEspera} días).
          </p>
          <div className="mt-4 divide-y divide-zinc-100">
            {paraReordenar.map((r) => (
              <div key={r.sku} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="font-medium text-zinc-900">{r.nombre}</p>
                  <p className="font-mono text-xs text-zinc-400">{r.sku}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-zinc-900">{r.stockActual} pzas</p>
                  <p className="text-xs text-zinc-400">punto: {r.puntoReorden.toFixed(0)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Stock por producto</h2>
        </div>
        {resumenes.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">
            Todavía no hay movimientos de stock. Se generan solos al recibir un contenedor.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-xs text-zinc-400">
                  <th className="px-6 py-2.5 font-medium">Producto</th>
                  <th className="px-6 py-2.5 font-medium text-right">Stock</th>
                  <th className="px-6 py-2.5 font-medium text-right">Costo prom.</th>
                  <th className="px-6 py-2.5 font-medium text-right">Valor</th>
                  <th className="px-6 py-2.5 font-medium text-right">Rotación/día</th>
                  <th className="px-6 py-2.5 font-medium">Bodegas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {resumenes.map((r) => (
                  <tr key={r.sku} className={r.necesitaReorden && r.stockActual > 0 ? "bg-amber-50/40" : ""}>
                    <td className="px-6 py-3">
                      <p className="font-medium text-zinc-900">{r.nombre}</p>
                      <p className="font-mono text-xs text-zinc-400">{r.sku}</p>
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-zinc-900">{r.stockActual}</td>
                    <td className="px-6 py-3 text-right text-zinc-600">{formatoPesos(r.costoPromedio)}</td>
                    <td className="px-6 py-3 text-right text-zinc-600">{formatoPesos(r.valorInventario)}</td>
                    <td className="px-6 py-3 text-right text-zinc-600">{r.rotacionDiaria.toFixed(2)}</td>
                    <td className="px-6 py-3 text-xs text-zinc-500">
                      {Array.from(r.stockPorBodega.entries())
                        .filter(([, cantidad]) => cantidad !== 0)
                        .map(([bodegaId, cantidad]) => `${bodegasPorId.get(bodegaId) ?? "?"}: ${cantidad}`)
                        .join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

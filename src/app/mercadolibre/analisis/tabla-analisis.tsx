"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FilaAnalisis } from "@/lib/mercadolibre-analisis";
import { agregarRestockDesdeAnalisis } from "../actions";

function n(v: number | null, dec = 1) {
  return v === null ? "—" : v.toLocaleString("es-MX", { maximumFractionDigits: dec });
}

/** Línea de tiempo del periodo: verde = disponible, rojo = sin stock,
 * gris claro = pausada, gris rayado = sin fotos (antes del historial). */
function LineaTiempo({ f }: { f: FilaAnalisis }) {
  const max = Math.max(1, ...f.diario.map((d) => d.ventas));
  return (
    <div className="space-y-1">
      <div className="flex h-10 items-end gap-px">
        {f.diario.map((d) => (
          <div key={d.dia} className="flex flex-1 flex-col items-stretch justify-end" title={`${d.dia.split("-").reverse().join("/")}: ${d.ventas} venta(s) · ${d.sinDatos ? "sin fotos" : `${Math.round(d.disponible * 100)}% disponible`}${d.sinStock > 0 ? ` · ${Math.round(d.sinStock * 100)}% sin stock` : ""}`}>
            <div className="w-full rounded-t-sm bg-zinc-900/80" style={{ height: `${(d.ventas / max) * 28}px` }} />
            <div
              className={`mt-px h-2 w-full ${d.sinDatos ? "bg-zinc-200" : d.disponible >= 0.5 ? "bg-emerald-500" : d.sinStock >= 0.5 ? "bg-red-400" : d.disponible > 0 ? "bg-emerald-300" : "bg-zinc-300"}`}
            />
          </div>
        ))}
      </div>
      <p className="text-[10px] text-zinc-400">
        Barras = ventas por día · Franja: <span className="text-emerald-600">verde</span> disponible, <span className="text-red-500">rojo</span> activa sin stock, gris pausada, gris claro sin fotos (aprox.).
      </p>
    </div>
  );
}

function BotonRestock({ f, contenedor }: { f: FilaAnalisis; contenedor: { id: string; numero: number } | null }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [cantidad, setCantidad] = useState(String(f.sugeridoPedir || ""));
  const [estado, setEstado] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  if (!f.sku) return <span className="text-[11px] text-zinc-400">sin ligar al CRM</span>;
  if (!contenedor) {
    return (
      <Link href="/contenedores" className="text-[11px] text-zinc-500 underline-offset-2 hover:underline">
        no hay contenedor configurándose
      </Link>
    );
  }
  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50">
        + Al contenedor #{contenedor.numero}
      </button>
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="w-20 rounded-lg border border-zinc-300 px-2 py-1 text-xs" />
        <button
          type="button"
          disabled={enviando || !(Number(cantidad) > 0)}
          onClick={async () => {
            setEnviando(true);
            setEstado(null);
            const r = await agregarRestockDesdeAnalisis(f.sku!, Number(cantidad));
            setEnviando(false);
            if (r.error) setEstado(r.error);
            else {
              setEstado(`Agregado al contenedor #${r.numero}.`);
              setAbierto(false);
              router.refresh();
            }
          }}
          className="rounded-lg bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {enviando ? "…" : "Agregar"}
        </button>
        <button type="button" onClick={() => setAbierto(false)} className="text-[11px] text-zinc-400 hover:text-zinc-900">
          cancelar
        </button>
      </div>
      {estado && <p className={`text-[11px] ${estado.startsWith("Agregado") ? "text-emerald-700" : "text-red-600"}`}>{estado}</p>}
    </div>
  );
}

export function TablaAnalisis({ filas, diasEspera, contenedor }: { filas: FilaAnalisis[]; diasEspera: number; contenedor: { id: string; numero: number } | null }) {
  const [busqueda, setBusqueda] = useState("");
  const [soloPedir, setSoloPedir] = useState(false);
  const texto = busqueda.trim().toLowerCase();
  const visibles = filas
    .filter((f) => !soloPedir || f.sugeridoPedir > 0)
    .filter((f) => !texto || [f.titulo, f.variacion, f.sku, ...f.itemIds].some((t) => t?.toLowerCase().includes(texto)));

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-100 p-4">
        <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto, SKU o MLM…" className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm sm:w-72" />
        <label className="flex items-center gap-2 text-xs text-zinc-700">
          <input type="checkbox" checked={soloPedir} onChange={(e) => setSoloPedir(e.target.checked)} className="rounded border-zinc-300" />
          Solo los que hay que pedir
        </label>
        <p className="ml-auto text-xs text-zinc-500">{visibles.length} producto(s)</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-[11px] uppercase tracking-wide text-zinc-400">
              <th className="py-2 pl-4 pr-2 font-medium">Producto</th>
              <th className="px-2 py-2 text-right font-medium">Días disp.</th>
              <th className="px-2 py-2 text-right font-medium">Sin stock</th>
              <th className="px-2 py-2 text-right font-medium">Vendidas</th>
              <th className="px-2 py-2 text-right font-medium">Por día</th>
              <th className="px-2 py-2 text-right font-medium">30 días</th>
              <th className="px-2 py-2 text-right font-medium">Stock hoy</th>
              <th className="px-2 py-2 text-right font-medium">Alcanza</th>
              <th className="px-2 py-2 text-right font-medium">Pedir ({diasEspera} d)</th>
              <th className="py-2 pl-2 pr-4 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visibles.map((f) => {
              const urgente = f.diasAlcanza !== null && f.diasAlcanza < diasEspera;
              return (
                <tr key={f.clave} className="align-top">
                  <td className="py-2.5 pl-4 pr-2">
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-start gap-3">
                        {f.imagenUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- miniatura de ML
                          <img src={f.imagenUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <div className="h-10 w-10 shrink-0 rounded-lg bg-zinc-100" />
                        )}
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm font-medium text-zinc-900">{f.titulo}</p>
                          <p className="text-[11px] text-zinc-400">
                            {f.variacion && <>{f.variacion} · </>}
                            {f.sku ? <span className="font-mono text-zinc-600">{f.sku}</span> : <span className="text-amber-600">sin ligar</span>}
                            {f.diasAproximados > 0 && <span className="text-zinc-400"> · {f.diasAproximados} día(s) aprox.</span>}
                            <span className="text-zinc-300"> · ver línea de tiempo</span>
                          </p>
                        </div>
                      </summary>
                      <div className="mt-2 w-full max-w-md">
                        <LineaTiempo f={f} />
                      </div>
                    </details>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-zinc-700">{n(f.diasDisponible)}</td>
                  <td className={`px-2 py-2.5 text-right tabular-nums ${f.diasSinStock > 0 ? "text-red-600" : "text-zinc-400"}`}>{n(f.diasSinStock)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-zinc-700">{f.piezasVendidas.toLocaleString("es-MX")}</td>
                  <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-zinc-900">{n(f.ventasPorDia, 2)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-zinc-700">{n(f.proyeccion30, 0)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-zinc-700">
                    {f.stockHoy.toLocaleString("es-MX")}
                    {f.stockFull > 0 && <span className="block text-[10px] text-zinc-400">{f.stockBodega} bodega + {f.stockFull} Full</span>}
                  </td>
                  <td className={`px-2 py-2.5 text-right tabular-nums ${urgente ? "font-semibold text-red-600" : "text-zinc-700"}`}>{f.diasAlcanza === null ? "—" : `${n(f.diasAlcanza, 0)} d`}</td>
                  <td className={`px-2 py-2.5 text-right tabular-nums ${f.sugeridoPedir > 0 ? "font-semibold text-amber-700" : "text-zinc-400"}`}>{f.sugeridoPedir > 0 ? f.sugeridoPedir.toLocaleString("es-MX") : "—"}</td>
                  <td className="py-2.5 pl-2 pr-4">
                    <BotonRestock f={f} contenedor={contenedor} />
                  </td>
                </tr>
              );
            })}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-sm text-zinc-400">
                  Nada que mostrar en este periodo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

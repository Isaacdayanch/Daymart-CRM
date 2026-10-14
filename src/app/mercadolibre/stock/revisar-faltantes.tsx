"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PublicacionEncontradaMl } from "@/lib/mercadolibre-stock";
import { buscarPublicacionMl, compararPublicacionesMl, traerPublicacionesMl } from "../actions";

const btnSec = "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50";
const btnPri = "rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50";

/** "¿Qué le falta al CRM contra Mercado Libre?": compara la lista real de
 * publicaciones de ML con la copia local, trae las que falten, y permite
 * buscar una por nombre o SKU en ML y traerla (14 oct; Isaac: "muchísimas
 * publicaciones no las encuentro en el CRM, el step aeróbico no está"). */
export function RevisarFaltantes({ conectado }: { conectado: boolean }) {
  const router = useRouter();
  const [comparando, setComparando] = useState(false);
  const [comparacion, setComparacion] = useState<{ enMl: number; enCrm: number; faltantes: string[]; sobrantes: string[] } | null>(null);
  const [trayendo, setTrayendo] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<PublicacionEncontradaMl[] | null>(null);

  async function comparar() {
    setComparando(true);
    setError(null);
    setMensaje(null);
    const r = await compararPublicacionesMl();
    setComparando(false);
    if (r.error) setError(r.error);
    else setComparacion({ enMl: r.enMl, enCrm: r.enCrm, faltantes: r.faltantes, sobrantes: r.sobrantes });
  }

  async function traer(ids: string[]) {
    setError(null);
    setMensaje(null);
    let traidas = 0;
    const fallidas: string[] = [];
    for (let i = 0; i < ids.length; i += 20) {
      setTrayendo(`Trayendo ${Math.min(i + 20, ids.length)} de ${ids.length}…`);
      const r = await traerPublicacionesMl(ids.slice(i, i + 20));
      traidas += r.traidas;
      fallidas.push(...r.fallidas);
      if (r.error) setError(r.error);
    }
    setTrayendo(null);
    setMensaje(`Listo: ${traidas} publicación(es) traída(s).${fallidas.length ? ` ${fallidas.length} no se pudieron leer (${fallidas.slice(0, 5).join(", ")}${fallidas.length > 5 ? "…" : ""}): vuelve a intentar en un minuto.` : ""}`);
    router.refresh();
    if (comparacion) await comparar();
    if (resultados) await buscar();
  }

  async function buscar() {
    if (!q.trim()) return;
    setBuscando(true);
    setError(null);
    const r = await buscarPublicacionMl(q);
    setBuscando(false);
    if (r.error) setError(r.error);
    setResultados(r.resultados);
  }

  return (
    <div id="faltantes" className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-zinc-900">¿Te falta alguna publicación en el CRM?</p>
          <p className="text-xs text-zinc-500">Comparo la lista real de Mercado Libre con la copia del CRM y traigo las que falten. O busca una por nombre o SKU y tráela.</p>
        </div>
        <button type="button" disabled={!conectado || comparando || Boolean(trayendo)} onClick={comparar} className={btnPri}>
          {comparando ? "Comparando…" : "Revisar contra Mercado Libre"}
        </button>
      </div>
      {comparacion && (
        <div className="mt-2 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700">
          <p>
            Mercado Libre tiene <strong>{comparacion.enMl.toLocaleString("es-MX")}</strong> publicaciones (activas, pausadas y finalizadas). El CRM tiene <strong>{comparacion.enCrm.toLocaleString("es-MX")}</strong>.
            {comparacion.faltantes.length > 0 ? (
              <>
                {" "}
                <strong className="text-amber-700">Faltan {comparacion.faltantes.length}</strong> en el CRM.
              </>
            ) : (
              <span className="text-emerald-700"> No falta ninguna.</span>
            )}
            {comparacion.sobrantes.length > 0 && <span className="text-zinc-500"> ({comparacion.sobrantes.length} en el CRM que ML ya no lista; se limpian en la siguiente actualización completa.)</span>}
          </p>
          {comparacion.faltantes.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" disabled={Boolean(trayendo)} onClick={() => traer(comparacion.faltantes)} className={btnPri}>
                {trayendo ?? `Traer las ${comparacion.faltantes.length} que faltan`}
              </button>
              <span className="font-mono text-[10px] text-zinc-400">
                {comparacion.faltantes.slice(0, 8).join(", ")}
                {comparacion.faltantes.length > 8 ? "…" : ""}
              </span>
            </div>
          )}
        </div>
      )}
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void buscar();
        }}
      >
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en Mercado Libre por nombre o SKU (ej. step aeróbico)" className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm sm:w-96" />
        <button type="submit" disabled={!conectado || buscando || !q.trim()} className={btnSec}>
          {buscando ? "Buscando…" : "Buscar en ML"}
        </button>
      </form>
      {resultados && (
        <ul className="mt-2 divide-y divide-zinc-100 text-xs">
          {resultados.length === 0 && <li className="py-2 text-zinc-500">Mercado Libre no encontró publicaciones tuyas con ese texto (la búsqueda por nombre solo ve las activas; por SKU ve todas).</li>}
          {resultados.map((r) => (
            <li key={r.item_id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span className="flex min-w-0 items-center gap-2">
                {r.imagen_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- miniatura de ML
                  <img src={r.imagen_url} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                ) : (
                  <span className="h-8 w-8 shrink-0 rounded bg-zinc-100" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-zinc-800">{r.titulo ?? r.item_id}</span>
                  <span className="font-mono text-[10px] text-zinc-400">
                    {r.item_id}
                    {r.estado && r.estado !== "active" && <span className="ml-1 rounded bg-zinc-100 px-1">{r.estado}</span>}
                    {r.seller_sku && <> · SKU {r.seller_sku}</>}
                  </span>
                </span>
              </span>
              {r.enCopia ? (
                <span className="text-emerald-700">ya está en el CRM</span>
              ) : (
                <button type="button" disabled={Boolean(trayendo)} onClick={() => traer([r.item_id])} className={btnPri}>
                  Traer al CRM
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {trayendo && !comparacion && <p className="mt-2 text-xs text-zinc-500">{trayendo}</p>}
      {mensaje && <p className="mt-2 text-xs text-emerald-700">{mensaje}</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

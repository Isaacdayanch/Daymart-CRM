"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PublicacionEncontradaMl, VarianteEncontradaMl } from "@/lib/mercadolibre-stock";
import { SelectorProducto } from "@/app/stock/salidas/selector-producto";
import { buscarPublicacionMl, compararPublicacionesMl, ligarVariante, traerPublicacionesMl, vincularPublicacion } from "../actions";

import { BotonGuardar } from "@/components/boton-guardar";
const btnSec = "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50";
const btnPri = "rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50";

interface Opcion {
  sku: string;
  nombre: string;
  stockActual: number;
  imagenUrl: string | null;
}

/** "¿Qué le falta al CRM contra Mercado Libre?": compara la lista real de
 * publicaciones de ML con la copia local, trae las que falten, y permite
 * buscar una por nombre o SKU en ML y traerla (14 oct; Isaac: "muchísimas
 * publicaciones no las encuentro en el CRM, el step aeróbico no está").
 * Si la publicación ya está en el CRM, se puede ligar con el producto AHÍ
 * MISMO, en el resultado (20 oct; Isaac: "que me deje ahí mismo, en el
 * mismo botón, ligar este producto a lo que ya está cargado en el CRM"). */
export function RevisarFaltantes({ conectado, opciones = [] }: { conectado: boolean; opciones?: Opcion[] }) {
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
    setMensaje(`Listo: ${traidas} publicación(es) traída(s).${fallidas.length ? ` ${fallidas.length} no se pudieron leer (${fallidas.slice(0, 5).join(", ")}${fallidas.length > 5 ? "…" : ""}): vuelve a intentar en un minuto.` : opciones.length ? " Ya puedes ligarla aquí abajo con su producto." : ""}`);
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
          <p className="text-xs text-zinc-500">
            Comparo la lista real de Mercado Libre con la copia del CRM y traigo las que falten. O busca una por nombre, SKU o número: la traes si falta y la ligas con su producto ahí mismo.
          </p>
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
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, SKU o número de publicación (ej. 2230571531)" className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm sm:w-96" />
        <BotonGuardar cargando={buscando} disabled={!conectado || !q.trim()} textoCargando="Buscando…" className={btnSec}>
          Buscar en ML
        </BotonGuardar>
      </form>
      {resultados && (
        <ul className="mt-2 divide-y divide-zinc-100 text-xs">
          {resultados.length === 0 && <li className="py-2 text-zinc-500">Mercado Libre no encontró publicaciones tuyas con ese texto (la búsqueda por nombre solo ve las activas; por SKU ve todas).</li>}
          {resultados.map((r) => (
            <li key={r.item_id} className="py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
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
                    {r.nota && <span className="block text-[11px] text-amber-700">{r.nota}</span>}
                  </span>
                </span>
                {r.enCopia ? (
                  <span className="text-emerald-700">ya está en el CRM</span>
                ) : r.traible === false ? (
                  <span className="text-zinc-400">no se puede traer</span>
                ) : (
                  <button type="button" disabled={Boolean(trayendo)} onClick={() => traer([r.item_id])} className={btnPri}>
                    Traer al CRM
                  </button>
                )}
              </div>
              {r.enCopia && opciones.length > 0 && r.variantes && r.variantes.length > 0 && (
                <ul className="mt-1.5 space-y-1.5 pl-10">
                  {r.variantes.map((v) => (
                    <LigaEnResultado
                      key={`${r.item_id}|${v.variation_id ?? 0}`}
                      itemId={r.item_id}
                      variante={v}
                      variasVariantes={r.variantes!.length > 1}
                      opciones={opciones}
                      alLigar={async () => {
                        router.refresh();
                        await buscar();
                      }}
                    />
                  ))}
                </ul>
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

/** La liga de UNA variante dentro del resultado de la búsqueda: muestra a
 * qué producto resuelve hoy (y por qué) o deja ligarla ahí mismo con el
 * selector de productos con foto. Con una sola variante la liga va POR SKU
 * de ML cuando la publicación trae SKU (aplica a todas sus publicaciones);
 * con varias variantes (colores) cada una se liga a su propio producto. */
function LigaEnResultado({
  itemId,
  variante,
  variasVariantes,
  opciones,
  alLigar,
}: {
  itemId: string;
  variante: VarianteEncontradaMl;
  variasVariantes: boolean;
  opciones: Opcion[];
  alLigar: () => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [elegido, setElegido] = useState(variante.skuCrm ?? "");
  const [factor, setFactor] = useState(String(variante.factor || 1));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const producto = variante.skuCrm ? opciones.find((o) => o.sku === variante.skuCrm) : undefined;
  const etiquetaVariante = variasVariantes && variante.variacion ? <strong className="text-zinc-800">{variante.variacion} · </strong> : null;

  async function ligar() {
    setGuardando(true);
    setError(null);
    const piezas = Number(factor) || 1;
    const r = variasVariantes ? await ligarVariante(itemId, variante.variation_id, elegido, piezas) : await vincularPublicacion(itemId, variante.variation_id, elegido, piezas);
    setGuardando(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setEditando(false);
    await alLigar();
  }

  if (editando) {
    return (
      <li className="rounded-lg border border-amber-200 bg-amber-50/60 p-2">
        <p className="text-[11px] text-zinc-700">
          {etiquetaVariante}¿Con qué producto del CRM va{variasVariantes ? " esta variante" : ""}?
        </p>
        <SelectorProducto opciones={opciones} value={elegido} onChange={setElegido} panelClase="left-0 w-full" />
        <label className="mt-1.5 flex items-center gap-2 text-[11px] text-zinc-600">
          Piezas del CRM por unidad de ML
          <input type="number" min={1} step={1} value={factor} onChange={(e) => setFactor(e.target.value)} className="w-14 rounded-lg border border-zinc-300 px-2 py-1 text-xs" />
          <span className="text-[10px] text-zinc-400">(1 normal; 2 si ML vende el par y tú cuentas piezas sueltas)</span>
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <button type="button" disabled={!elegido || guardando} onClick={ligar} className={btnPri}>
            {guardando ? "Ligando…" : "Ligar con este producto"}
          </button>
          <button type="button" onClick={() => setEditando(false)} className="text-zinc-500 hover:text-zinc-900">
            Cancelar
          </button>
        </div>
        {!variasVariantes && variante.seller_sku && <p className="mt-1 text-[10px] text-zinc-400">Se liga por el SKU de ML ({variante.seller_sku}): aplica a todas las publicaciones que lo traigan.</p>}
        {error && <p className="mt-1 text-red-600">{error}</p>}
      </li>
    );
  }

  if (variante.skuCrm) {
    return (
      <li className="text-[11px] text-zinc-600">
        {etiquetaVariante}→ ligada a <strong className="text-zinc-900">{producto?.nombre ?? variante.skuCrm}</strong> <span className="font-mono text-zinc-400">({variante.skuCrm})</span>
        <span className="text-zinc-400">{variante.origen === "codigo" ? " · por Código ML" : variante.origen === "sku" ? " · por SKU de ML" : variante.origen === "auto" ? " · mismo SKU" : " · por publicación"}</span>
        {variante.factor > 1 && <span className="font-medium text-violet-700"> · {variante.factor} pzas por unidad</span>}
        {" · "}
        <button type="button" onClick={() => setEditando(true)} className="text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline">
          cambiar
        </button>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-2 text-[11px]">
      <span className="text-amber-700">{etiquetaVariante}sin ligar a ningún producto del CRM</span>
      <button type="button" onClick={() => setEditando(true)} className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 font-medium text-amber-800 hover:bg-amber-100">
        Ligar con producto
      </button>
    </li>
  );
}

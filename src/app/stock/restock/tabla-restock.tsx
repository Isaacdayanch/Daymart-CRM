"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { diasQueAlcanza, piezasParaCubrirEspera } from "@/lib/calculos-stock";
import { formatoCajas } from "@/lib/formato";
import { agregarRestockDesdeAnalisis } from "@/app/mercadolibre/actions";

export interface FilaRestock {
  sku: string;
  nombre: string;
  categoria: string;
  imagenUrl: string | null;
  stockActual: number;
  cajas: number;
  rotacionDiaria: number;
  puntoReorden: number;
  /** Piezas en Full de ML (solo dueño con ML conectado). */
  enFull: number | null;
  /** Piezas que ya salieron de bodega y van en camino a Full. */
  enCamino: number | null;
}

function normaliza(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const num = (n: number, dec = 0) => n.toLocaleString("es-MX", { maximumFractionDigits: dec, minimumFractionDigits: 0 });

export function TablaRestock({
  filas,
  diasEspera,
  conFull,
  contenedor,
}: {
  filas: FilaRestock[];
  diasEspera: number;
  conFull: boolean;
  /** Contenedor en "Configurándose" para el botón "+ Al contenedor" (null =
   * no hay ninguno; undefined = sin botón, p. ej. operadora). */
  contenedor?: { id: string; numero: number } | null;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState("");
  const categorias = useMemo(() => [...new Set(filas.map((f) => f.categoria))].sort((a, b) => a.localeCompare(b, "es")), [filas]);
  const visibles = useMemo(() => {
    const q = normaliza(busqueda.trim());
    return filas.filter((f) => (!q || normaliza(f.nombre).includes(q) || normaliza(f.sku).includes(q)) && (!categoria || f.categoria === categoria));
  }, [filas, busqueda, categoria]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 sm:flex-row sm:items-center">
        <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o SKU" className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm sm:w-72" />
        {categorias.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setCategoria("")} className={`rounded-full px-3 py-1 text-xs font-medium ${!categoria ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
              Todas
            </button>
            {categorias.map((c) => (
              <button key={c} type="button" onClick={() => setCategoria(c === categoria ? "" : c)} className={`rounded-full px-3 py-1 text-xs font-medium ${categoria === c ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
                {c}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-xs text-zinc-400">
              <th className="px-4 py-2.5 font-medium">Producto</th>
              <th className="px-4 py-2.5 text-right font-medium">En bodega</th>
              {conFull && <th className="px-4 py-2.5 text-right font-medium text-[#2D3277]">En Full</th>}
              <th className="px-4 py-2.5 text-right font-medium">Salen/día</th>
              <th className="px-4 py-2.5 text-right font-medium">Alcanza</th>
              <th className="px-4 py-2.5 text-right font-medium">Punto de reorden</th>
              <th className="px-4 py-2.5 text-right font-medium">Pedir</th>
              {contenedor !== undefined && <th className="px-4 py-2.5 font-medium"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {visibles.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-xs text-zinc-500">
                  Nada coincide con la búsqueda.
                </td>
              </tr>
            )}
            {visibles.map((f) => {
              const dias = diasQueAlcanza(f);
              const pedir = piezasParaCubrirEspera(f, diasEspera);
              const agotado = f.stockActual <= 0;
              return (
                <tr key={f.sku} className={agotado ? "bg-rose-50/40" : ""}>
                  <td className="px-4 py-3">
                    <Link href={`/stock/producto/${encodeURIComponent(f.sku)}`} className="flex items-center gap-3 hover:underline">
                      {f.imagenUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- miniatura en tabla, tamaño fijo
                        <img src={f.imagenUrl} alt={f.nombre} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-[9px] text-zinc-400">Sin foto</div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-900">{f.nombre}</p>
                        <p className="font-mono text-xs text-zinc-400">
                          {f.sku}
                          {f.categoria && f.categoria !== "Sin categoría" && <span className="ml-1.5 font-sans text-zinc-400">· {f.categoria}</span>}
                        </p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {agotado ? (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">agotado</span>
                    ) : (
                      <>
                        <span className="font-semibold text-zinc-900">{num(f.stockActual)}</span>
                        <span className="block text-[11px] text-zinc-400">{formatoCajas(f.cajas)}</span>
                      </>
                    )}
                  </td>
                  {conFull && (
                    <td className="px-4 py-3 text-right tabular-nums text-[#2D3277]">
                      {f.enFull ? num(f.enFull) : <span className="text-zinc-300">—</span>}
                      {f.enCamino ? <span className="block text-[11px] text-zinc-400">+{num(f.enCamino)} en camino</span> : null}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-700">{f.rotacionDiaria.toLocaleString("es-MX", { maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {dias === null ? (
                      <span className="text-zinc-300">—</span>
                    ) : (
                      <span className={`font-semibold ${dias < diasEspera / 2 ? "text-rose-600" : "text-amber-700"}`}>{agotado ? "0 días" : `~${num(dias)} días`}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-500">{num(f.puntoReorden)} pzas</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {pedir > 0 ? <span className="font-semibold text-amber-700">{num(pedir)} pzas</span> : <span className="text-zinc-400">al límite</span>}
                    <span className="block text-[11px] text-zinc-400">para {diasEspera} días</span>
                  </td>
                  {contenedor !== undefined && (
                    <td className="px-4 py-3">
                      <BotonAlContenedor sku={f.sku} propuesta={pedir} contenedor={contenedor} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-zinc-100 px-4 py-3 text-[11px] text-zinc-400">
        Salen/día = salidas de bodega de los últimos 90 días ÷ 90 (ventas directas, envíos a Full y ventas de ML que salen de bodega; los ajustes no cuentan). Punto de reorden = salen/día × {diasEspera} días. Pedir = lo que falta para cubrir esos {diasEspera} días con lo que hay en bodega.
      </p>
    </div>
  );
}

/** "+ Al contenedor #N": agrega el producto al contenedor que se está
 * configurando con la cantidad propuesta (misma acción que en Análisis de
 * venta). Solo dueño; si no hay contenedor configurándose lo dice. */
function BotonAlContenedor({ sku, propuesta, contenedor }: { sku: string; propuesta: number; contenedor: { id: string; numero: number } | null }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [cantidad, setCantidad] = useState(String(propuesta || ""));
  const [estado, setEstado] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  if (!contenedor) {
    return (
      <Link href="/contenedores" className="whitespace-nowrap text-[11px] text-zinc-400 underline-offset-2 hover:underline">
        no hay contenedor configurándose
      </Link>
    );
  }
  if (!abierto) {
    return (
      <div>
        <button type="button" onClick={() => setAbierto(true)} className="whitespace-nowrap rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50">
          + Al contenedor #{contenedor.numero}
        </button>
        {estado && <p className="mt-1 max-w-40 text-[11px] text-emerald-700">{estado}</p>}
      </div>
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
            const r = await agregarRestockDesdeAnalisis(sku, Number(cantidad));
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
        <button type="button" onClick={() => setAbierto(false)} className="text-[11px] text-zinc-500 hover:text-zinc-900">
          Cancelar
        </button>
      </div>
      {estado && <p className={`max-w-48 text-[11px] ${/Agregado/.test(estado) ? "text-emerald-700" : "text-red-600"}`}>{estado}</p>}
    </div>
  );
}

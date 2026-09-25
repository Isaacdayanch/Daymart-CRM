"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatoPesos } from "@/lib/formato";
import { margenPublicacion, precioNuevo as calcularPrecioNuevo, redondear } from "@/lib/mercadolibre-margen";
import { CampoFecha } from "@/components/campo-fecha";
import { aplicarPromocionesMl } from "../actions";
import { PromocionesItem } from "./promociones-item";

export interface FilaPrecio {
  id: string;
  itemId: string;
  variationId: number | null;
  titulo: string;
  variacion: string | null;
  imagenUrl: string | null;
  catalogo: boolean;
  logistica: string | null;
  precio: number;
  precioOriginal: number | null;
  /** null = todavía no se sincronizó la comisión (SQL 0040 + Actualizar). */
  comisionPct: number | null;
  comisionFija: number;
  /** null = sin ventas con costo de envío en 90 días. */
  envio: number | null;
  /** null = sin producto del CRM ligado. */
  costo: number | null;
  skuCrm: string | null;
  nombreCrm: string | null;
  piezas: number;
  valor: number;
}

type Modo = "FIJO" | "PORCENTAJE" | "MARGEN";
type Resultado = { ok: boolean; error?: string; precioNuevo: number };

const claseInput = "rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

function pctTexto(n: number) {
  return `${n.toFixed(1)}%`;
}

export function TablaPromociones({ filas, margenMinimo }: { filas: FilaPrecio[]; margenMinimo: number }) {
  const router = useRouter();
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [modo, setModo] = useState<Modo>("PORCENTAJE");
  const [valor, setValor] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [soloAbajo, setSoloAbajo] = useState(false);
  const [permitirAbajo, setPermitirAbajo] = useState(false);
  const [aplicando, setAplicando] = useState<{ hechos: number; total: number } | null>(null);
  const [resultados, setResultados] = useState<Map<string, Resultado>>(new Map());
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const valorNum = Number(valor.replace(",", "."));
  const hayValor = valor.trim() !== "" && Number.isFinite(valorNum);

  const [finFecha, setFinFecha] = useState("");

  // Margen actual y propuesto por renglón (cálculo en vivo). El descuento
  // se calcula sobre el precio BASE (si ya hay promoción, el original).
  const calculadas = useMemo(
    () =>
      filas.map((f) => {
        const base = f.precioOriginal && f.precioOriginal > f.precio ? f.precioOriginal : f.precio;
        const datos = { comisionPct: f.comisionPct ?? 0, comisionFija: f.comisionFija, envio: f.envio ?? 0, costo: f.costo ?? 0 };
        const puedeMargen = f.comisionPct !== null && f.costo !== null;
        const actual = puedeMargen ? margenPublicacion({ precio: f.precio, ...datos }) : null;
        const nuevo = hayValor && (modo !== "MARGEN" || puedeMargen) ? calcularPrecioNuevo(modo, modo === "PORCENTAJE" ? -Math.abs(valorNum) : valorNum, base, datos) : null;
        const margenNuevo = nuevo !== null && puedeMargen ? margenPublicacion({ precio: nuevo, ...datos }) : null;
        return { f, base, puedeMargen, actual, nuevo, margenNuevo, abajo: actual !== null && actual.pct < margenMinimo, nuevoAbajo: margenNuevo !== null && margenNuevo.pct < margenMinimo };
      }),
    [filas, modo, valorNum, hayValor, margenMinimo],
  );

  const texto = busqueda.trim().toLowerCase();
  const visibles = calculadas.filter(
    (c) => (!texto || [c.f.titulo, c.f.variacion, c.f.itemId, c.f.skuCrm, c.f.nombreCrm].some((t) => t?.toLowerCase().includes(texto))) && (!soloAbajo || c.abajo),
  );
  const abajoTotal = calculadas.filter((c) => c.abajo).length;
  const sinLiga = calculadas.filter((c) => c.f.costo === null).length;

  const seleccionadas = calculadas.filter((c) => seleccion.has(c.f.id));
  // Una promoción solo puede BAJAR el precio base (nunca subirlo).
  const listas = seleccionadas.filter((c) => c.nuevo !== null && c.nuevo > 0 && redondear(c.nuevo) < redondear(c.base));
  const subirian = seleccionadas.filter((c) => c.nuevo !== null && redondear(c.nuevo) >= redondear(c.base)).length;
  const bloqueadas = listas.filter((c) => c.nuevoAbajo && !permitirAbajo);
  const porAplicar = listas.filter((c) => !bloqueadas.includes(c));

  const alternar = (id: string) =>
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const todasVisibles = visibles.length > 0 && visibles.every((c) => seleccion.has(c.f.id));

  const aplicar = async () => {
    if (porAplicar.length === 0) return;
    const resumen = porAplicar
      .slice(0, 6)
      .map((c) => `• ${c.f.titulo.slice(0, 40)}: ${formatoPesos(c.base)} → ${formatoPesos(c.nuevo ?? 0)} (${(100 - ((c.nuevo ?? 0) / c.base) * 100).toFixed(0)}% off)`)
      .join("\n");
    const mas = porAplicar.length > 6 ? `\n…y ${porAplicar.length - 6} más` : "";
    const vigencia = finFecha ? `hasta el ${finFecha}` : "sin fecha de fin (la quitas cuando quieras)";
    if (!window.confirm(`Vas a aplicar ${porAplicar.length} promoción(es) "Descuento del vendedor" en Mercado Libre, ${vigencia}. El precio base NO cambia.\n\n${resumen}${mas}\n\n¿Aplicar?`)) return;
    setErrorGeneral(null);
    setAplicando({ hechos: 0, total: porAplicar.length });
    const nuevos = new Map(resultados);
    for (let i = 0; i < porAplicar.length; i += 10) {
      const tanda = porAplicar.slice(i, i + 10);
      const r = await aplicarPromocionesMl(
        tanda.map((c) => ({
          itemId: c.f.itemId,
          titulo: c.f.titulo,
          tipo: "PRICE_DISCOUNT",
          precioPromo: c.nuevo ?? 0,
          precioBase: c.base,
          finFecha: finFecha || null,
          modo,
          margenEstimadoPct: c.margenNuevo ? redondear(c.margenNuevo.pct) : null,
        })),
      );
      if (r.error) {
        setErrorGeneral(r.error);
        break;
      }
      for (const c of tanda) {
        const res = r.resultados.find((x) => x.itemId === c.f.itemId);
        nuevos.set(c.f.id, { ok: Boolean(res?.ok), error: res?.error, precioNuevo: c.nuevo ?? 0 });
      }
      setResultados(new Map(nuevos));
      setAplicando({ hechos: Math.min(i + 10, porAplicar.length), total: porAplicar.length });
    }
    setAplicando(null);
    setSeleccion(new Set());
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-medium text-zinc-500">¿Cómo quieres el precio con descuento?</p>
              <div className="mt-1 flex overflow-hidden rounded-xl border border-zinc-300 text-xs">
                {(
                  [
                    ["PORCENTAJE", "Bajar %"],
                    ["FIJO", "Precio fijo"],
                    ["MARGEN", "Que me deje X% de margen"],
                  ] as const
                ).map(([v, t]) => (
                  <button key={v} type="button" onClick={() => setModo(v)} className={`px-3.5 py-2 ${modo === v ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:text-zinc-900"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500">{modo === "PORCENTAJE" ? "% de descuento" : modo === "FIJO" ? "Precio con descuento ($)" : "Margen que quieres (%)"}</p>
              <input
                type="number"
                step={modo === "FIJO" ? "1" : "0.5"}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder={modo === "PORCENTAJE" ? "10" : modo === "FIJO" ? "499" : String(margenMinimo + 10)}
                className={`mt-1 w-40 ${claseInput}`}
              />
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500">Hasta (opcional)</p>
              <div className="mt-1 w-44">
                <CampoFecha name="fin" defaultValue="" onChange={setFinFecha} />
              </div>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end">
            <button
              type="button"
              onClick={aplicar}
              disabled={porAplicar.length === 0 || aplicando !== null}
              className="rounded-xl bg-[#2D3277] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#232860] disabled:opacity-40"
            >
              {aplicando ? `Aplicando ${aplicando.hechos} de ${aplicando.total}…` : `Aplicar ${porAplicar.length > 0 ? `${porAplicar.length} promoción(es)` : "promoción"} en Mercado Libre`}
            </button>
            {bloqueadas.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-red-700">
                <input type="checkbox" checked={permitirAbajo} onChange={(e) => setPermitirAbajo(e.target.checked)} />
                {bloqueadas.length} quedarían abajo del margen mínimo ({margenMinimo}%) — aplicar de todos modos
              </label>
            )}
            {seleccion.size > 0 && listas.length === 0 && hayValor && <p className="text-xs text-zinc-500">Con ese valor ningún seleccionado queda abajo de su precio base — una promoción solo puede bajar el precio.</p>}
            {subirian > 0 && listas.length > 0 && <p className="text-xs text-zinc-500">{subirian} seleccionado(s) no se tocan porque su precio no bajaría.</p>}
            {seleccion.size > 0 && !hayValor && <p className="text-xs text-zinc-500">Pon el valor para ver el precio nuevo.</p>}
          </div>
        </div>
        {errorGeneral && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{errorGeneral}</p>}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre, SKU o ID…" className={`w-full sm:w-72 ${claseInput}`} />
        <button
          type="button"
          onClick={() => setSoloAbajo((v) => !v)}
          className={`rounded-xl border px-3.5 py-2 text-xs ${soloAbajo ? "border-red-300 bg-red-50 text-red-700" : "border-zinc-300 bg-white text-zinc-600"}`}
        >
          Abajo del margen mínimo ({abajoTotal})
        </button>
        {sinLiga > 0 && <span className="text-xs text-amber-700">{sinLiga} sin producto del CRM ligado (sin costo, sin margen)</span>}
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-[11px] uppercase tracking-wide text-zinc-400">
              <th className="px-3 py-2.5">
                <input type="checkbox" checked={todasVisibles} onChange={() => setSeleccion(todasVisibles ? new Set() : new Set(visibles.map((c) => c.f.id)))} />
              </th>
              <th className="px-2 py-2.5">Publicación</th>
              <th className="px-2 py-2.5 text-right">Precio</th>
              <th className="px-2 py-2.5 text-right">Comisión</th>
              <th className="px-2 py-2.5 text-right">Envío</th>
              <th className="px-2 py-2.5 text-right">Costo</th>
              <th className="px-2 py-2.5 text-right">Te queda</th>
              <th className="px-2 py-2.5 text-right">Con descuento</th>
              <th className="px-2 py-2.5 text-right">Te quedaría</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visibles.map(({ f, base, actual, nuevo, margenNuevo, abajo, nuevoAbajo }) => {
              const marcada = seleccion.has(f.id);
              const res = resultados.get(f.id);
              return (
                <tr key={f.id} className={marcada ? "bg-[#2D3277]/5" : ""}>
                  <td className="px-3 py-2.5 align-top">
                    <input type="checkbox" checked={marcada} onChange={() => alternar(f.id)} />
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex gap-2.5">
                      {f.imagenUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- miniatura de Mercado Libre
                        <img src={f.imagenUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg border border-zinc-100 object-cover" />
                      ) : (
                        <div className="h-11 w-11 shrink-0 rounded-lg bg-zinc-100" />
                      )}
                      <div className="min-w-0">
                        <p className="line-clamp-2 max-w-xs leading-snug text-zinc-900" title={f.titulo}>
                          {f.titulo}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-zinc-400">
                          <span className="font-mono">{f.itemId}</span>
                          {f.variacion && <span>{f.variacion}</span>}
                          {f.catalogo && <span className="rounded bg-violet-50 px-1 text-violet-700">catálogo</span>}
                          {f.logistica && <span>{f.logistica}</span>}
                          {f.skuCrm ? <span className="font-mono text-zinc-600">{f.skuCrm}</span> : <span className="text-amber-700">sin ligar</span>}
                        </p>
                        <PromocionesItem
                          itemId={f.itemId}
                          titulo={f.titulo}
                          precioBase={base}
                          margenDe={(precio) => (f.comisionPct !== null && f.costo !== null ? margenPublicacion({ precio, comisionPct: f.comisionPct, comisionFija: f.comisionFija, envio: f.envio ?? 0, costo: f.costo }) : null)}
                          margenMinimo={margenMinimo}
                        />
                        {res && (
                          <p className={`mt-0.5 text-[11px] ${res.ok ? "text-emerald-700" : "text-red-700"}`}>
                            {res.ok ? `✓ promoción aplicada a ${formatoPesos(res.precioNuevo)}` : `✕ ${res.error ?? "falló"}`}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right align-top">
                    <p className="font-medium text-zinc-900">{formatoPesos(base)}</p>
                    {base !== f.precio && <p className="text-[11px] text-emerald-700">en promo: {formatoPesos(f.precio)}</p>}
                  </td>
                  <td className="px-2 py-2.5 text-right align-top text-zinc-600">
                    {actual ? (
                      <>
                        <p>{formatoPesos(actual.comision)}</p>
                        <p className="text-[11px] text-zinc-400">
                          {pctTexto(f.comisionPct ?? 0)}
                          {f.comisionFija > 0 && ` + $${f.comisionFija}`}
                        </p>
                      </>
                    ) : f.comisionPct === null ? (
                      <span className="text-[11px] text-zinc-300">sin dato</span>
                    ) : (
                      <p>{formatoPesos(f.precio * (f.comisionPct / 100) + f.comisionFija)}</p>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right align-top text-zinc-600">{f.envio === null ? <span className="text-[11px] text-zinc-300">—</span> : formatoPesos(f.envio)}</td>
                  <td className="px-2 py-2.5 text-right align-top text-zinc-600">{f.costo === null ? <span className="text-[11px] text-amber-600">sin liga</span> : formatoPesos(f.costo)}</td>
                  <td className="px-2 py-2.5 text-right align-top">
                    {actual ? (
                      <>
                        <p className={`font-semibold ${abajo ? "text-red-600" : "text-emerald-700"}`}>{formatoPesos(actual.queda)}</p>
                        <p className={`text-[11px] ${abajo ? "text-red-500" : "text-zinc-400"}`}>{pctTexto(actual.pct)}</p>
                      </>
                    ) : (
                      <span className="text-[11px] text-zinc-300">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right align-top">
                    {marcada && nuevo !== null ? <p className="font-semibold text-[#2D3277]">{formatoPesos(nuevo)}</p> : <span className="text-[11px] text-zinc-300">—</span>}
                  </td>
                  <td className="px-2 py-2.5 text-right align-top">
                    {marcada && margenNuevo ? (
                      <>
                        <p className={`font-semibold ${nuevoAbajo ? "text-red-600" : "text-emerald-700"}`}>{formatoPesos(margenNuevo.queda)}</p>
                        <p className={`text-[11px] ${nuevoAbajo ? "text-red-500" : "text-zinc-400"}`}>{pctTexto(margenNuevo.pct)}</p>
                      </>
                    ) : (
                      <span className="text-[11px] text-zinc-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-zinc-400">
                  Nada que mostrar con ese filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

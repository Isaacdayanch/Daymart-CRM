"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoMonto } from "@/components/campo-monto";
import { BotonGuardar } from "@/components/boton-guardar";
import { ACCIONES_DIRECTOR, agruparPorArea } from "@/lib/director";
import type { PropuestaDirector } from "@/lib/tipos";
import { decidirPropuestas, type DecisionPantalla } from "./actions";

interface Ajuste {
  rechazar: boolean;
  precio: string;
}

/** Las propuestas que esperan decisión, con el sistema que a Isaac le gusta:
 * marca con "No" las que NO quiere (y cambia el precio si quiere otro), y un
 * solo botón aprueba todo lo demás. */
export function PropuestasPendientes({ propuestas }: { propuestas: PropuestaDirector[] }) {
  const router = useRouter();
  const [ajustes, setAjustes] = useState<Record<string, Ajuste>>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function ajusteDe(p: PropuestaDirector): Ajuste {
    return ajustes[p.id] ?? { rechazar: false, precio: p.precio_propuesto === null ? "" : String(p.precio_propuesto) };
  }
  function actualizar(p: PropuestaDirector, cambio: Partial<Ajuste>) {
    setAjustes((a) => ({ ...a, [p.id]: { ...ajusteDe(p), ...cambio } }));
  }

  const rechazadas = propuestas.filter((p) => ajusteDe(p).rechazar).length;
  const aprobadas = propuestas.length - rechazadas;

  async function guardar(modo: "NORMAL" | "RECHAZAR_TODAS") {
    setCargando(true);
    setError(null);
    const decisiones: DecisionPantalla[] = propuestas.map((p) => {
      const a = ajusteDe(p);
      const rechazar = modo === "RECHAZAR_TODAS" || a.rechazar;
      const precioNum = a.precio.trim() === "" ? null : Number(a.precio);
      const cambioPrecio = precioNum !== null && Number.isFinite(precioNum) && precioNum !== p.precio_propuesto ? precioNum : null;
      return { id: p.id, decision: rechazar ? "RECHAZAR" : "APROBAR", precio: rechazar ? null : cambioPrecio };
    });
    const r = await decidirPropuestas(decisiones);
    setCargando(false);
    if ("error" in r && r.error) {
      setError(r.error);
      return;
    }
    const fallidas = "fallidas" in r ? (r.fallidas ?? 0) : 0;
    const ejecutadas = "ejecutadas" in r ? (r.ejecutadas ?? 0) : 0;
    const errorEjecucion = "errorEjecucion" in r ? r.errorEjecucion : null;
    if (fallidas > 0 || errorEjecucion) {
      setError(
        errorEjecucion
          ? `Se guardaron tus decisiones, pero no se pudieron aplicar en Mercado Libre: ${errorEjecucion}`
          : `Se guardaron tus decisiones. ${ejecutadas} se aplicaron en Mercado Libre y ${fallidas} fallaron: abajo, en el historial, dice por qué y puedes reintentar.`,
      );
    }
    router.refresh();
  }

  if (propuestas.length === 0) return null;

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-[#2D3277]/20 bg-[#2D3277]/5 p-4 text-sm text-[#2D3277]">
        <p className="font-semibold">{propuestas.length} propuesta(s) esperando tu decisión</p>
        <p className="mt-1 text-xs">
          Marca con <strong>No</strong> las que no quieras y cambia el precio donde quieras otro. Todo lo demás se aprueba con el botón de abajo. Nada se hace en Mercado Libre sin tu
          aprobación.
        </p>
      </div>

      {agruparPorArea(propuestas).map((g) => (
        <div key={g.area} className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-900">
              {g.emoji} {g.etiqueta} <span className="font-normal text-zinc-400">· {g.propuestas.length}</span>
            </h2>
          </div>
          <ul className="divide-y divide-zinc-100">
            {g.propuestas.map((p) => {
              const a = ajusteDe(p);
              const accion = ACCIONES_DIRECTOR[p.accion_tipo];
              return (
                <li key={p.id} className={`flex gap-3 px-4 py-3 transition ${a.rechazar ? "bg-zinc-50 opacity-60" : ""}`}>
                  <div className="flex w-7 shrink-0 flex-col items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-400">#{p.orden}</span>
                    {p.imagen_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- miniatura de Mercado Libre o del catálogo
                      <img src={p.imagen_url} alt="" className="h-7 w-7 rounded-md object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium text-zinc-900 ${a.rechazar ? "line-through" : ""}`}>{p.titulo}</p>
                    {p.detalle && <p className="mt-0.5 text-xs text-zinc-600">{p.detalle}</p>}
                    {p.porque && <p className="mt-0.5 text-[11px] text-zinc-400">Por qué: {p.porque}</p>}
                    <p className="mt-1 text-[11px] text-zinc-400">
                      {accion?.etiqueta ?? p.accion_tipo}
                      {p.sku_crm && <> · {p.sku_crm}</>}
                      {p.item_id && <> · {p.item_id}</>}
                    </p>
                    {p.precio_propuesto !== null && !a.rechazar && (
                      <div className="mt-2 flex items-center gap-2">
                        <label className="text-xs text-zinc-500">Precio</label>
                        <div className="w-36">
                          <CampoMonto value={a.precio} onChange={(v) => actualizar(p, { precio: v })} className="text-sm" />
                        </div>
                        {Number(a.precio) !== p.precio_propuesto && a.precio !== "" && (
                          <span className="text-[11px] text-amber-700">propuesto ${Number(p.precio_propuesto).toLocaleString("es-MX")}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => actualizar(p, { rechazar: !a.rechazar })}
                    className={`h-8 shrink-0 self-start rounded-full border px-3 text-xs font-medium transition ${
                      a.rechazar ? "border-red-300 bg-red-50 text-red-700" : "border-zinc-200 text-zinc-500 hover:border-red-300 hover:text-red-700"
                    }`}
                  >
                    {a.rechazar ? "No ✓" : "No"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void guardar("NORMAL");
        }}
        className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-lg backdrop-blur-sm"
      >
        <p className="text-xs text-zinc-500">
          Se aprueban <strong className="text-zinc-900">{aprobadas}</strong> y se rechazan <strong className="text-zinc-900">{rechazadas}</strong>.
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void guardar("RECHAZAR_TODAS")} disabled={cargando} className="rounded-xl px-3 py-2 text-xs text-zinc-500 hover:text-red-700 disabled:opacity-50">
            Rechazar todas
          </button>
          <BotonGuardar cargando={cargando} textoCargando="Guardando…" textoListo="Listo" className="rounded-xl bg-[#2D3277] px-4 py-2 text-sm font-medium text-white hover:bg-[#232862]">
            {aprobadas > 0 ? `Aprobar ${aprobadas} y rechazar ${rechazadas}` : "Guardar decisiones"}
          </BotonGuardar>
        </div>
      </form>
    </section>
  );
}

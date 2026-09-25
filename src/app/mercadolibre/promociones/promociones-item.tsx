"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatoFechaMx } from "@/lib/fechas-mx";
import { formatoPesos } from "@/lib/formato";
import type { Margen } from "@/lib/mercadolibre-margen";
import { ESTADOS_PROMOCION, TIPOS_PROMOCION, type PromocionItem } from "@/lib/mercadolibre-promociones";
import { aplicarPromocionesMl, promocionesItemMl, quitarPromocionMl } from "../actions";

/** Debajo de cada publicación: "Promociones de ML" — las campañas que
 * Mercado Libre le ofrece (con el margen a su precio sugerido) y las que ya
 * tiene activas, para participar o quitarse desde aquí. Se consulta solo
 * cuando Isaac le pica (una llamada por publicación). */
export function PromocionesItem({
  itemId,
  titulo,
  precioBase,
  margenDe,
  margenMinimo,
}: {
  itemId: string;
  titulo: string;
  precioBase: number;
  margenDe: (precio: number) => Margen | null;
  margenMinimo: number;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [lista, setLista] = useState<PromocionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [precios, setPrecios] = useState<Record<string, string>>({});

  const cargar = async () => {
    setCargando(true);
    setError(null);
    const r = await promocionesItemMl(itemId);
    setCargando(false);
    if (r.error) setError(r.error);
    setLista(r.promociones);
  };

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => {
          setAbierto(true);
          if (lista === null) void cargar();
        }}
        className="mt-1 text-[11px] text-[#2D3277] underline-offset-2 hover:underline"
      >
        Promociones de ML ▸
      </button>
    );
  }

  const clave = (p: PromocionItem) => `${p.tipo}|${p.id ?? ""}`;

  return (
    <div className="mt-1.5 rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-[11px]">
      <div className="flex items-center justify-between">
        <p className="font-medium text-zinc-700">Promociones de Mercado Libre</p>
        <div className="flex gap-2">
          <button type="button" onClick={cargar} className="text-zinc-500 hover:text-zinc-900">
            {cargando ? "…" : "actualizar"}
          </button>
          <button type="button" onClick={() => setAbierto(false)} className="text-zinc-500 hover:text-zinc-900">
            cerrar
          </button>
        </div>
      </div>
      {error && <p className="mt-1 text-red-600">{error}</p>}
      {cargando && lista === null && <p className="mt-1 text-zinc-400">Consultando a Mercado Libre…</p>}
      {lista && lista.length === 0 && !error && <p className="mt-1 text-zinc-500">Mercado Libre no ofrece ninguna campaña para esta publicación ahorita.</p>}
      {lista && lista.length > 0 && (
        <ul className="mt-1 space-y-1.5">
          {lista.map((p) => {
            const activa = p.estado === "started" || p.estado === "pending";
            const k = clave(p);
            const precioTexto = precios[k] ?? (p.precioPromo ?? p.precioSugerido ?? "").toString();
            const precio = Number(precioTexto) || 0;
            const m = precio > 0 ? margenDe(precio) : null;
            const abajo = m !== null && m.pct < margenMinimo;
            const descuento = precio > 0 && precioBase > 0 ? 100 - (precio / precioBase) * 100 : null;
            return (
              <li key={k} className="rounded-md border border-zinc-200 bg-white p-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-medium text-zinc-900">{TIPOS_PROMOCION[p.tipo] ?? p.tipo}</span>
                  {p.nombre && <span className="text-zinc-500">{p.nombre}</span>}
                  <span className={`rounded-full px-1.5 py-0.5 ${activa ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>{ESTADOS_PROMOCION[p.estado ?? ""] ?? p.estado ?? "?"}</span>
                  {(p.inicio || p.fin) && (
                    <span className="text-zinc-400">
                      {p.inicio ? formatoFechaMx(p.inicio) : "…"} → {p.fin ? formatoFechaMx(p.fin) : "sin fin"}
                    </span>
                  )}
                  {p.limite && !activa && <span className="text-amber-700">aceptar antes del {formatoFechaMx(p.limite)}</span>}
                  {p.meliPct !== null && p.meliPct > 0 && <span className="text-emerald-700">ML pone {p.meliPct}%</span>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {activa ? (
                    <>
                      <span className="text-zinc-700">
                        precio en promo {p.precioPromo !== null ? formatoPesos(p.precioPromo) : "—"}
                        {m && (
                          <>
                            {" "}
                            · te queda <span className={abajo ? "text-red-600" : "text-emerald-700"}>{formatoPesos(m.queda)} ({m.pct.toFixed(1)}%)</span>
                          </>
                        )}
                      </span>
                      <button
                        type="button"
                        disabled={ocupado === k}
                        onClick={async () => {
                          if (!window.confirm(`¿Quitar “${titulo.slice(0, 50)}” de ${TIPOS_PROMOCION[p.tipo] ?? p.tipo}? Vuelve a su precio base.`)) return;
                          setOcupado(k);
                          const r = await quitarPromocionMl({ itemId, titulo, tipo: p.tipo, promocionId: p.id, precioBase });
                          setOcupado(null);
                          if (r.error) setError(r.error);
                          else {
                            await cargar();
                            router.refresh();
                          }
                        }}
                        className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        {ocupado === k ? "…" : "Quitar"}
                      </button>
                    </>
                  ) : (
                    <>
                      <label className="flex items-center gap-1 text-zinc-600">
                        precio
                        <input
                          type="number"
                          value={precioTexto}
                          onChange={(e) => setPrecios((x) => ({ ...x, [k]: e.target.value }))}
                          className="w-20 rounded border border-zinc-300 px-1.5 py-0.5 text-[11px]"
                        />
                      </label>
                      {p.precioMin !== null && p.precioMax !== null && (
                        <span className="text-zinc-400">
                          entre {formatoPesos(p.precioMin)} y {formatoPesos(p.precioMax)}
                        </span>
                      )}
                      {descuento !== null && <span className="text-zinc-500">{descuento.toFixed(0)}% off</span>}
                      {m && (
                        <span className={abajo ? "text-red-600" : "text-emerald-700"}>
                          te queda {formatoPesos(m.queda)} ({m.pct.toFixed(1)}%)
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={ocupado === k}
                        onClick={async () => {
                          const aviso = abajo ? `\n\nOJO: quedarías abajo de tu margen mínimo (${margenMinimo}%).` : "";
                          if (!window.confirm(`¿Participar en ${TIPOS_PROMOCION[p.tipo] ?? p.tipo} con “${titulo.slice(0, 50)}” a ${formatoPesos(precio)}? El precio base no cambia.${aviso}`)) return;
                          setOcupado(k);
                          const r = await aplicarPromocionesMl([{ itemId, titulo, tipo: p.tipo, promocionId: p.id, precioPromo: precio > 0 ? precio : null, precioBase, modo: "CAMPANA", margenEstimadoPct: m ? Math.round(m.pct * 100) / 100 : null }]);
                          setOcupado(null);
                          const res = r.resultados[0];
                          if (r.error || !res?.ok) setError(r.error ?? res?.error ?? "No se pudo aplicar.");
                          else {
                            await cargar();
                            router.refresh();
                          }
                        }}
                        className="rounded bg-[#2D3277] px-2 py-0.5 text-white hover:bg-[#232860] disabled:opacity-50"
                      >
                        {ocupado === k ? "…" : "Participar"}
                      </button>
                    </>
                  )}
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-zinc-400">datos crudos</summary>
                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-zinc-100 p-1.5 text-[10px] text-zinc-600">{JSON.stringify(p.crudo, null, 1)}</pre>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

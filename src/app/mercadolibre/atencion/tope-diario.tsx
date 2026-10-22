"use client";

import { useState } from "react";
import { guardarTope } from "./actions";

const OPCIONES = [0.5, 1, 1.5, 2];

/** Tope diario de gasto en la IA: lo que lleva hoy y cuánto puede gastar
 * como máximo (Isaac: "$1 o $2 diarios, no más"). */
export function TopeDiario({ gastoHoy, limite }: { gastoHoy: number; limite: number }) {
  const [actual, setActual] = useState(limite);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const porcentaje = Math.min(100, (gastoHoy / actual) * 100);

  async function elegir(valor: number) {
    setGuardando(true);
    setError(null);
    const r = await guardarTope(valor);
    setGuardando(false);
    if (r.error) setError(r.error);
    else setActual(valor);
  }

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-900">Gasto de la IA hoy</p>
        <p className="text-sm text-zinc-500">
          <span className="text-lg font-semibold text-zinc-900">${gastoHoy.toFixed(2)}</span> de ${actual.toFixed(2)} USD
        </p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
        <div className={`h-full rounded-full ${porcentaje >= 90 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${porcentaje}%` }} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-500">Tope por día:</span>
        {OPCIONES.map((o) => (
          <button
            key={o}
            type="button"
            disabled={guardando}
            onClick={() => elegir(o)}
            className={`rounded-full px-3.5 py-1.5 font-medium transition ${o === actual ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
          >
            ${o.toFixed(2)}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        Cada respuesta cuesta unos 3 centavos de dólar: con $1 alcanzan para ~25–30 preguntas al día. Al llegar al tope la IA se detiene sola hasta el día siguiente (horario de la CDMX) y las preguntas siguen llegando para que las contestes tú.
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

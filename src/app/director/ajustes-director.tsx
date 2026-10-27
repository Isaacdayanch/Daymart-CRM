"use client";

import { useState } from "react";
import { BotonGuardar } from "@/components/boton-guardar";
import { borrarChatDirectorAccion, guardarAjustesDirector, guardarTopeDirector } from "./actions";

const OPCIONES = [1, 2, 3, 5];

/** Lo que Isaac controla del Director: cuánto puede gastar al día, si la
 * lista de la mañana se arma sola y a qué hora, y las reglas que le ha ido
 * dando (las puede corregir a mano). */
export function AjustesDirector({ gastoHoy, limite, listaManana, horaManana, reglas, ultimaManana }: { gastoHoy: number; limite: number; listaManana: boolean; horaManana: string; reglas: string | null; ultimaManana: string | null }) {
  const [actual, setActual] = useState(limite);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const porcentaje = Math.min(100, (gastoHoy / actual) * 100);

  async function elegir(valor: number) {
    setGuardando(true);
    setError(null);
    const r = await guardarTopeDirector(valor);
    setGuardando(false);
    if (r.error) setError(r.error);
    else setActual(valor);
  }

  return (
    <details className="rounded-3xl border border-zinc-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2 px-5 py-4">
        <span className="text-sm font-semibold text-zinc-900">Ajustes del Director</span>
        <span className="text-sm text-zinc-500">
          Gasto de hoy: <span className="font-semibold text-zinc-900">${gastoHoy.toFixed(2)}</span> de ${actual.toFixed(2)} USD
        </span>
      </summary>
      <div className="space-y-6 border-t border-zinc-100 px-5 py-5">
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
            <div className={`h-full rounded-full ${porcentaje >= 90 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${porcentaje}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
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
            Cada respuesta cuesta entre 3 y 20 centavos de dólar según cuánto tenga que leer (la revisión completa de la mañana, unos 15–30 centavos). Al llegar al tope se detiene hasta el día siguiente (horario CDMX). Este tope es aparte del de Atención a clientes.
          </p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        <form action={guardarAjustesDirector} className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-zinc-800">
            <input type="checkbox" name="lista_manana" defaultChecked={listaManana} className="h-4 w-4 rounded border-zinc-300" />
            Armar la lista de la mañana solo, todos los días
          </label>
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-700">
            <span>a las</span>
            <input name="hora_manana" defaultValue={horaManana} placeholder="08:25" className="w-20 rounded-lg border border-zinc-200 px-2 py-1 text-center font-mono text-sm" />
            <span className="text-xs text-zinc-400">(hora de la CDMX; el reloj revisa cada 10 minutos, así que puede salir unos minutos después)</span>
          </div>
          {ultimaManana && <p className="text-xs text-zinc-400">Última lista automática: {ultimaManana}.</p>}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-800">Reglas que le has dado en el chat</label>
            <textarea
              name="reglas"
              defaultValue={reglas ?? ""}
              rows={5}
              placeholder="Aquí se van guardando solas cuando le dices una regla (ej. “la olla siempre a 1,990”). Puedes corregirlas a mano."
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-[#2D3277] focus:bg-white focus:outline-none"
            />
            <p className="mt-1 text-xs text-zinc-400">Las reglas base (liquidación, estrellas, precios fijados, calendario) viven en su manual; si quieres cambiar una, dímelo en el chat del programador.</p>
          </div>
          <BotonGuardar className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">Guardar ajustes</BotonGuardar>
        </form>

        <form
          action={borrarChatDirectorAccion}
          onSubmit={(e) => {
            if (!confirm("¿Borrar toda la conversación con el Director? Las propuestas, la bitácora y las reglas se quedan.")) e.preventDefault();
          }}
        >
          <button type="submit" className="text-xs text-zinc-400 underline-offset-2 hover:text-red-600 hover:underline">
            borrar la conversación
          </button>
        </form>
      </div>
    </details>
  );
}

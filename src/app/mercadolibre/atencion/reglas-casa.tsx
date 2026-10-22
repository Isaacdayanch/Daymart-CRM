"use client";

import { useState } from "react";
import { BotonGuardar } from "@/components/boton-guardar";
import { guardarReglas } from "./actions";

const EJEMPLO = `Ejemplos (cámbialos por lo que de verdad aplica en Daymart):
- Si compras antes de las 12 del día, sale el mismo día.
- Sí damos factura: se pide desde tu compra en Mercado Libre.
- Los espejos llevan protección en las esquinas y van en caja de cartón doble.
- Garantía de 30 días contra defectos de fábrica.`;

/** Reglas de la casa: datos fijos que la IA siempre debe respetar. */
export function ReglasCasa({ reglas }: { reglas: string | null }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <details className="rounded-3xl border border-zinc-200 bg-white p-5" open={!reglas}>
      <summary className="cursor-pointer text-sm font-semibold text-zinc-900">
        Reglas de la casa {reglas ? "" : <span className="ml-1 font-normal text-amber-700">(todavía no escribes ninguna)</span>}
      </summary>
      <p className="mt-2 text-xs text-zinc-500">
        Lo que la IA siempre debe saber y respetar al contestar: envíos, factura, garantía, horarios… Escríbelo como se lo dirías a un empleado nuevo. Mientras más claro, menos tienes que corregir.
      </p>
      <form
        action={async (fd) => {
          setError(null);
          const r = await guardarReglas(fd);
          if (r.error) setError(r.error);
        }}
        className="mt-3 space-y-3"
      >
        <textarea
          name="reglas"
          defaultValue={reglas ?? ""}
          rows={7}
          placeholder={EJEMPLO}
          className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:bg-white"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <BotonGuardar className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800">Guardar reglas</BotonGuardar>
      </form>
    </details>
  );
}

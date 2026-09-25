"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarMargenMinimoMl } from "../actions";

/** Margen mínimo (%) que Isaac no quiere perforar: los precios que quedan
 * abajo se marcan en rojo y no se aplican sin confirmarlo aparte. */
export function MargenMinimo({ valor }: { valor: number }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(String(valor));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  if (!editando) {
    return (
      <button type="button" onClick={() => setEditando(true)} className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-left shadow-sm hover:bg-zinc-50">
        <p className="text-[11px] text-zinc-400">Margen mínimo</p>
        <p className="text-lg font-semibold text-zinc-900">
          {valor}% <span className="text-xs font-normal text-zinc-400">· cambiar</span>
        </p>
      </button>
    );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setGuardando(true);
        setError(null);
        const r = await guardarMargenMinimoMl(Number(texto));
        setGuardando(false);
        if (r.error) setError(r.error);
        else {
          setEditando(false);
          router.refresh();
        }
      }}
      className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm"
    >
      <label className="block text-[11px] text-zinc-400">Margen mínimo (%)</label>
      <div className="mt-1 flex items-center gap-2">
        <input type="number" min={0} max={89} step={0.5} value={texto} onChange={(e) => setTexto(e.target.value)} className="w-20 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm" autoFocus />
        <button type="submit" disabled={guardando} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          {guardando ? "…" : "Guardar"}
        </button>
        <button type="button" onClick={() => setEditando(false)} className="text-xs text-zinc-500">
          Cancelar
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </form>
  );
}

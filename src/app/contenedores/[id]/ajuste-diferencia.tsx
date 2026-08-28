"use client";

import { useState } from "react";
import { CampoNumero } from "@/components/campo-numero";
import { formatoPesos } from "@/lib/formato";
import { actualizarAjusteDiferencia } from "./actions";

const NOTA_DEFAULT = "Gastos extraordinarios — fletes internos China, ajustes de proveedor";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export function AjusteDiferencia({
  contenedorId,
  diferenciaBruta,
  ajusteActual,
  notaActual,
}: {
  contenedorId: string;
  diferenciaBruta: number;
  ajusteActual: number;
  notaActual: string | null;
}) {
  const [editando, setEditando] = useState(false);
  const guardar = actualizarAjusteDiferencia.bind(null, contenedorId);

  if (!editando) {
    if (ajusteActual !== 0) {
      return (
        <p className="mt-2 text-xs text-zinc-500">
          Diferencia explicada: <span className="font-medium text-zinc-700">{formatoPesos(ajusteActual)}</span>
          {notaActual ? ` — ${notaActual}` : ""}{" "}
          <button type="button" onClick={() => setEditando(true)} className="text-zinc-400 underline hover:text-zinc-900">
            editar
          </button>
        </p>
      );
    }
    if (Math.abs(diferenciaBruta) < 1) return null;
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="mt-2 text-xs font-medium text-zinc-500 underline hover:text-zinc-900"
      >
        + Explicar esta diferencia
      </button>
    );
  }

  return (
    <form
      action={async (formData) => {
        await guardar(formData);
        setEditando(false);
      }}
      className="mt-3 grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-[160px_1fr_auto_auto] sm:items-end"
    >
      <div>
        <label className="block text-xs font-medium text-zinc-500">Monto (pesos)</label>
        <CampoNumero
          name="ajuste_diferencia_pesos"
          defaultValue={ajusteActual !== 0 ? ajusteActual : Math.round(diferenciaBruta)}
          className={claseCampo}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500">¿Qué fue?</label>
        <input
          type="text"
          name="ajuste_diferencia_nota"
          defaultValue={notaActual ?? NOTA_DEFAULT}
          className={claseCampo}
        />
      </div>
      <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
        Guardar
      </button>
      <button
        type="button"
        onClick={() => setEditando(false)}
        className="text-xs font-medium text-zinc-400 hover:text-zinc-700"
      >
        Cancelar
      </button>
    </form>
  );
}

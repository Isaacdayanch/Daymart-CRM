"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoMonto } from "@/components/campo-monto";
import { formatoPesos } from "@/lib/formato";
import { actualizarCostoManual } from "../../actions";

export function EditarCostoManual({ movimientoId, costoActual }: { movimientoId: string; costoActual: number }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (editando) {
    return (
      <form
        action={async (formData) => {
          setEnviando(true);
          setError(null);
          const resultado = await actualizarCostoManual(movimientoId, formData);
          setEnviando(false);
          if (resultado?.error) setError(resultado.error);
          else {
            setEditando(false);
            router.refresh();
          }
        }}
        className="flex flex-wrap items-center justify-end gap-1"
      >
        <div className="w-24">
          <CampoMonto
            name="costo_unitario_pesos"
            defaultValue={costoActual}
            required
            className="w-full rounded-lg border border-zinc-300 px-2 py-1 text-right text-xs focus:border-zinc-500 focus:ring-zinc-500"
          />
        </div>
        <button type="submit" disabled={enviando} className="text-xs font-medium text-zinc-900 hover:underline">
          {enviando ? "..." : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => setEditando(false)}
          className="text-xs text-zinc-400 hover:text-zinc-700"
        >
          Cancelar
        </button>
        {error && <p className="w-full text-right text-[11px] text-red-600">{error}</p>}
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditando(true)}
      className="text-xs text-zinc-500 underline decoration-dotted hover:text-zinc-900"
    >
      {formatoPesos(costoActual)} · editar
    </button>
  );
}

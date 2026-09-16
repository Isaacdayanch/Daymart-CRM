"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import type { MovimientoStock } from "@/lib/tipos";
import { actualizarMovimientoStock, eliminarMovimientoStock } from "../actions";

/** "editar" / "quitar" para un movimiento suelto del libro de Stock. */
export function AccionesMovimiento({ movimiento }: { movimiento: MovimientoStock }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const hoyTexto = new Date().toISOString().slice(0, 10);

  if (editando) {
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setGuardando(true);
          setError(null);
          const r = await actualizarMovimientoStock(movimiento.id, new FormData(e.currentTarget));
          setGuardando(false);
          if (r.error) {
            setError(r.error);
            return;
          }
          setEditando(false);
          router.refresh();
        }}
        className="mt-2 flex flex-wrap items-end gap-2"
      >
        <div>
          <label className="block text-[11px] text-zinc-500">Cantidad</label>
          <input
            type="number"
            name="cantidad"
            defaultValue={movimiento.cantidad}
            className="mt-0.5 block w-24 rounded-lg border border-zinc-300 px-2 py-1 text-xs focus:border-zinc-500 focus:ring-zinc-500"
          />
        </div>
        <div>
          <label className="block text-[11px] text-zinc-500">Fecha</label>
          <div className="mt-0.5">
            <CampoFecha name="fecha" defaultValue={movimiento.creado_en.slice(0, 10)} max={hoyTexto} />
          </div>
        </div>
        <div>
          <label className="block text-[11px] text-zinc-500">Nota</label>
          <input
            type="text"
            name="referencia"
            defaultValue={movimiento.referencia ?? ""}
            className="mt-0.5 block w-40 rounded-lg border border-zinc-300 px-2 py-1 text-xs focus:border-zinc-500 focus:ring-zinc-500"
          />
        </div>
        <button
          type="submit"
          disabled={guardando}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {guardando ? "..." : "Guardar"}
        </button>
        <button type="button" onClick={() => setEditando(false)} className="text-xs text-zinc-500 hover:text-zinc-900">
          Cancelar
        </button>
        {error && <p className="w-full text-xs text-red-600">{error}</p>}
      </form>
    );
  }

  return (
    <div className="mt-1 text-[11px]">
      <button type="button" onClick={() => setEditando(true)} className="text-zinc-400 hover:text-zinc-900">
        editar
      </button>
      <button
        type="button"
        onClick={async () => {
          if (!window.confirm(`¿Quitar este movimiento de "${movimiento.nombre}"? El stock se recalcula solo.`)) return;
          const r = await eliminarMovimientoStock(movimiento.id);
          if (r.error) {
            setError(r.error);
            return;
          }
          router.refresh();
        }}
        className="ml-2 text-zinc-400 hover:text-red-600"
      >
        quitar
      </button>
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}

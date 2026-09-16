"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { crearCliente } from "../actions";

export function FormularioCliente() {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const claseInput =
    "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

  return (
    <form
      ref={ref}
      onSubmit={async (e) => {
        e.preventDefault();
        setGuardando(true);
        setError(null);
        const r = await crearCliente(new FormData(e.currentTarget));
        setGuardando(false);
        if (r.error) {
          setError(r.error);
          return;
        }
        ref.current?.reset();
        router.refresh();
      }}
      className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-zinc-900">Agregar cliente</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Nombre</label>
          <input type="text" name="nombre" required placeholder="Ej. Ferretería López" className={claseInput} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Teléfono (opcional)</label>
          <input type="text" name="telefono" className={claseInput} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Días de crédito (opcional)</label>
          <input type="number" name="dias_credito" min={1} placeholder="Ej. 30" className={claseInput} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Notas (opcional)</label>
          <input type="text" name="notas" className={claseInput} />
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex justify-end">
        <button
          type="submit"
          disabled={guardando}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {guardando ? "Guardando..." : "Guardar cliente"}
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Marca } from "@/lib/tipos";
import { actualizarMarca, crearMarca, eliminarMarca } from "./actions";

const claseCampo = "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

/** Marcas: nombre + código de 3 letras que encabeza el SKU. */
export function Marcas({ marcas, productosPorMarca }: { marcas: Marca[]; productosPorMarca: Record<string, number> }) {
  const router = useRouter();
  const [editando, setEditando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 p-5">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Marcas</h2>
          <p className="text-xs text-zinc-500">El código de cada marca encabeza el SKU: MARCA-PRODUCTO-VARIANTE.</p>
        </div>
        {!abierto && (
          <button type="button" onClick={() => setAbierto(true)} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700">
            + Nueva marca
          </button>
        )}
      </div>
      {abierto && (
        <form
          action={async (fd) => {
            setError(null);
            const r = await crearMarca(fd);
            if (r?.error) setError(r.error);
            else {
              setAbierto(false);
              router.refresh();
            }
          }}
          className="grid gap-3 border-b border-zinc-100 bg-zinc-50 p-5 sm:grid-cols-[1fr_8rem_1fr_auto] sm:items-end"
        >
          <div>
            <label className="block text-xs font-medium text-zinc-500">Nombre</label>
            <input name="nombre" required placeholder="Ej. Mamey" className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Código (3 letras)</label>
            <input name="codigo" required maxLength={4} placeholder="MAM" className={`${claseCampo} font-mono uppercase`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Notas (opcional)</label>
            <input name="notas" placeholder="Ej. línea de gym" className={claseCampo} />
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
              Guardar
            </button>
            <button type="button" onClick={() => setAbierto(false)} className="text-xs text-zinc-500 hover:text-zinc-900">
              Cancelar
            </button>
          </div>
          {error && <p className="text-xs text-red-600 sm:col-span-4">{error}</p>}
        </form>
      )}
      <ul className="divide-y divide-zinc-100">
        {marcas.map((m) =>
          editando === m.id ? (
            <li key={m.id} className="bg-zinc-50 p-4">
              <form
                action={async (fd) => {
                  setError(null);
                  const r = await actualizarMarca(m.id, fd);
                  if (r?.error) setError(r.error);
                  else {
                    setEditando(null);
                    router.refresh();
                  }
                }}
                className="grid gap-3 sm:grid-cols-[1fr_8rem_1fr_auto] sm:items-end"
              >
                <input name="nombre" defaultValue={m.nombre} required className={claseCampo} />
                <input name="codigo" defaultValue={m.codigo} required maxLength={4} className={`${claseCampo} font-mono uppercase`} />
                <input name="notas" defaultValue={m.notas ?? ""} className={claseCampo} />
                <div className="flex items-center gap-2">
                  <button type="submit" className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700">
                    Guardar
                  </button>
                  <button type="button" onClick={() => setEditando(null)} className="text-xs text-zinc-500">
                    Cancelar
                  </button>
                </div>
                {error && <p className="text-xs text-red-600 sm:col-span-4">{error}</p>}
              </form>
            </li>
          ) : (
            <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="flex items-center gap-3">
                <span className="rounded-md bg-zinc-900 px-2 py-0.5 font-mono text-xs font-semibold text-white">{m.codigo}</span>
                <div>
                  <p className="font-medium text-zinc-900">{m.nombre}</p>
                  <p className="text-xs text-zinc-400">
                    {productosPorMarca[m.id] ?? 0} producto(s){m.notas ? ` · ${m.notas}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button type="button" onClick={() => setEditando(m.id)} className="text-zinc-400 hover:text-zinc-900 hover:underline">
                  editar
                </button>
                {!(productosPorMarca[m.id] ?? 0) && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm(`¿Quitar la marca ${m.nombre}?`)) return;
                      const r = await eliminarMarca(m.id);
                      if (r?.error) alert(r.error);
                      else router.refresh();
                    }}
                    className="text-zinc-400 hover:text-red-600 hover:underline"
                  >
                    quitar
                  </button>
                )}
              </div>
            </li>
          ),
        )}
        {marcas.length === 0 && <li className="px-5 py-6 text-center text-sm text-zinc-400">Todavía no hay marcas. Corre el SQL 0038 y aparecen Daymart y Mamey.</li>}
      </ul>
    </div>
  );
}

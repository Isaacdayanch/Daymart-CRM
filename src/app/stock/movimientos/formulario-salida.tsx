"use client";

import { useState } from "react";
import type { Bodega } from "@/lib/tipos";
import { registrarSalida } from "../actions";

interface Opcion {
  sku: string;
  nombre: string;
  stockActual: number;
}

export function FormularioSalida({ opciones, bodegas }: { opciones: Opcion[]; bodegas: Bodega[] }) {
  const [sku, setSku] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);

  const opcionActual = opciones.find((o) => o.sku === sku);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700"
      >
        + Registrar salida
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">Registrar salida</h2>
      <form
        action={async (formData) => {
          const resultado = await registrarSalida(formData);
          if (resultado?.error) {
            setError(resultado.error);
          } else {
            setError(null);
            setAbierto(false);
            setSku("");
          }
        }}
        className="mt-4 space-y-3"
      >
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Producto</label>
            <select
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
            >
              <option value="" disabled>
                Selecciona un producto
              </option>
              {opciones.map((o) => (
                <option key={o.sku} value={o.sku}>
                  {o.nombre} — {o.stockActual} en stock
                </option>
              ))}
            </select>
            <input type="hidden" name="sku" value={sku} />
            <input type="hidden" name="nombre" value={opcionActual?.nombre ?? ""} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Bodega</label>
            <select
              name="bodega_id"
              required
              defaultValue={bodegas[0]?.id}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
            >
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Cantidad</label>
            <input
              type="number"
              name="cantidad"
              min={1}
              required
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Destino</label>
            <input
              type="text"
              name="destino"
              placeholder="Ej. Full, venta directa"
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Comentario</label>
            <input
              type="text"
              name="referencia"
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setAbierto(false)}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-900"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
          >
            Guardar salida
          </button>
        </div>
      </form>
    </div>
  );
}

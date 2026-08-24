"use client";

import { useState } from "react";
import type { Bodega, Producto } from "@/lib/tipos";
import { confirmarRecepcion } from "./actions";

export function FormularioRecepcion({
  contenedorId,
  productos,
  bodegas,
}: {
  contenedorId: string;
  productos: Producto[];
  bodegas: Bodega[];
}) {
  const [cantidades, setCantidades] = useState<Record<string, string>>(
    Object.fromEntries(productos.map((p) => [p.id, String(p.cantidad)])),
  );
  const [enviando, setEnviando] = useState(false);

  const accion = confirmarRecepcion.bind(null, contenedorId);

  return (
    <form
      action={async (formData) => {
        setEnviando(true);
        await accion(formData);
      }}
      className="space-y-4"
    >
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <label className="block text-xs font-medium text-zinc-500">Bodega de recepción</label>
        <select
          name="bodega_id"
          required
          defaultValue={bodegas[0]?.id}
          className="mt-1.5 block w-full max-w-xs rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
        >
          {bodegas.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {productos.map((producto) => {
          const cantidadTexto = cantidades[producto.id] ?? "";
          const cantidadRecibida = Number(cantidadTexto) || 0;
          const faltante = producto.cantidad - cantidadRecibida;
          const hayFaltante = faltante > 0;

          return (
            <div
              key={producto.id}
              className={`rounded-2xl border bg-white p-5 shadow-sm transition ${
                hayFaltante ? "border-amber-300 ring-1 ring-amber-100" : "border-zinc-200"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {producto.imagen_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura rápida en un form
                    <img
                      src={producto.imagen_url}
                      alt={producto.nombre}
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-zinc-100" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{producto.nombre}</p>
                    <p className="font-mono text-xs text-zinc-400">{producto.sku}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs text-zinc-400">Pedido</p>
                    <p className="text-sm font-medium text-zinc-500">{producto.cantidad}</p>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400">Recibido</label>
                    <input
                      type="number"
                      name={`cantidad_${producto.id}`}
                      min={0}
                      value={cantidadTexto}
                      onChange={(e) =>
                        setCantidades((prev) => ({ ...prev, [producto.id]: e.target.value }))
                      }
                      className={`mt-1 w-24 rounded-lg border px-3 py-1.5 text-right text-sm font-semibold focus:ring-2 ${
                        hayFaltante
                          ? "border-amber-300 text-amber-700 focus:border-amber-500 focus:ring-amber-200"
                          : "border-zinc-300 text-zinc-900 focus:border-zinc-500 focus:ring-zinc-200"
                      }`}
                    />
                  </div>
                </div>
              </div>

              {hayFaltante && (
                <div className="mt-4 space-y-2 rounded-xl bg-amber-50 p-4">
                  <p className="text-xs font-medium text-amber-800">
                    Faltan {faltante} piezas. ¿Qué pasó con ellas?
                  </p>
                  <input
                    type="text"
                    name={`nota_${producto.id}`}
                    placeholder="Ej. Se quedó con Sarah Kuo en TOPKO, no ocupó el acomodo"
                    className="block w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:ring-amber-200"
                  />
                  <label className="flex items-center gap-2 text-xs text-amber-800">
                    <input type="checkbox" name={`pagado_${producto.id}`} value="true" className="rounded" />
                    Esa parte ya está pagada
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={enviando}
          className="rounded-xl bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 disabled:opacity-50"
        >
          {enviando ? "Guardando..." : "Confirmar recepción"}
        </button>
      </div>
    </form>
  );
}

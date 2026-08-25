"use client";

import { useState } from "react";
import type { Bodega, Producto } from "@/lib/tipos";
import { confirmarRecepcion, editarRecepcion } from "./actions";

export function FormularioRecepcion({
  contenedorId,
  productos,
  bodegas,
  modoEdicion,
  bodegaOriginalId,
}: {
  contenedorId: string;
  productos: Producto[];
  bodegas: Bodega[];
  modoEdicion: boolean;
  bodegaOriginalId?: string;
}) {
  const [cantidades, setCantidades] = useState<Record<string, string>>(
    Object.fromEntries(productos.map((p) => [p.id, String(p.cantidad)])),
  );
  const [enviando, setEnviando] = useState(false);

  const accion = (modoEdicion ? editarRecepcion : confirmarRecepcion).bind(null, contenedorId);
  const hoy = new Date();
  const hoyTexto = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;

  return (
    <form
      action={async (formData) => {
        setEnviando(true);
        await accion(formData);
      }}
      className="space-y-4"
    >
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className={`grid gap-4 ${modoEdicion ? "" : "sm:grid-cols-2"}`}>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Bodega</label>
            <select
              name="bodega_id"
              required
              defaultValue={bodegaOriginalId ?? bodegas[0]?.id}
              className="mt-1.5 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
            >
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre}
                </option>
              ))}
            </select>
          </div>
          {!modoEdicion && (
            <div>
              <label className="block text-xs font-medium text-zinc-500">Fecha de recepción</label>
              <input
                type="date"
                name="fecha_recepcion"
                defaultValue={hoyTexto}
                max={hoyTexto}
                required
                className="mt-1.5 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
              />
              <p className="mt-1 text-xs text-zinc-400">
                Hoy por defecto — cámbiala si estás cargando un contenedor de hace tiempo.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {productos.map((producto) => {
          const cantidadTexto = cantidades[producto.id] ?? "";
          const cantidadNueva = Number(cantidadTexto) || 0;
          const diferencia = cantidadNueva - producto.cantidad;
          const hayFaltante = !modoEdicion && diferencia < 0;
          const hayDiferencia = modoEdicion && diferencia !== 0;

          return (
            <div
              key={producto.id}
              className={`rounded-2xl border bg-white p-5 shadow-sm transition ${
                hayFaltante || hayDiferencia ? "border-amber-300 ring-1 ring-amber-100" : "border-zinc-200"
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
                    <p className="text-xs text-zinc-400">{modoEdicion ? "En sistema" : "Pedido"}</p>
                    <p className="text-sm font-medium text-zinc-500">{producto.cantidad}</p>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400">
                      {modoEdicion ? "Conteo nuevo" : "Recibido"}
                    </label>
                    <input
                      type="number"
                      name={`cantidad_${producto.id}`}
                      min={0}
                      value={cantidadTexto}
                      onChange={(e) =>
                        setCantidades((prev) => ({ ...prev, [producto.id]: e.target.value }))
                      }
                      className={`mt-1 w-24 rounded-lg border px-3 py-1.5 text-right text-sm font-semibold focus:ring-2 ${
                        hayFaltante || hayDiferencia
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
                    Faltan {-diferencia} piezas. ¿Qué pasó con ellas?
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

              {hayDiferencia && (
                <p className="mt-3 text-xs font-medium text-amber-800">
                  {diferencia > 0 ? `Se suman ${diferencia} piezas al stock.` : `Se restan ${-diferencia} piezas del stock.`}
                </p>
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
          {enviando ? "Guardando..." : modoEdicion ? "Guardar corrección" : "Confirmar recepción"}
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import Image from "next/image";
import { formatoPesos } from "@/lib/formato";
import { cartones, cbmProducto, costoFinalPorPieza } from "@/lib/calculos";
import { Selector } from "@/components/selector";
import type { PendienteChina, Producto } from "@/lib/tipos";
import { agregarProducto, actualizarProducto, eliminarProducto, moverProducto } from "./actions";
import { CamposProducto } from "./campos-producto";

export function Productos({
  contenedorId,
  productos,
  costoPorCbm,
  tipoCambioMercancia,
  fabricaPrincipal,
  proveedorPrincipal,
  catalogo,
  pendientesChina,
  categoriasSugeridas,
  fabricasSugeridas,
  proveedoresSugeridos,
}: {
  contenedorId: string;
  productos: Producto[];
  costoPorCbm: number;
  tipoCambioMercancia: number;
  fabricaPrincipal: string | null;
  proveedorPrincipal: string | null;
  catalogo: Producto[];
  pendientesChina: PendienteChina[];
  categoriasSugeridas: string[];
  fabricasSugeridas: string[];
  proveedoresSugeridos: string[];
}) {
  const [vista, setVista] = useState<"tabla" | "galeria">("tabla");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [restockId, setRestockId] = useState("");
  const [pendienteId, setPendienteId] = useState("");
  const productoRestock = catalogo.find((p) => p.id === restockId);
  const pendiente = pendientesChina.find((p) => p.id === pendienteId);
  // Casi siempre un contenedor trae puros productos de la misma categoría,
  // así que se precarga la del último que ya está en la lista.
  const categoriaPorDefecto = productos[productos.length - 1]?.categoria;

  async function alAgregar(formData: FormData) {
    const resultado = await agregarProducto(contenedorId, formData);
    if (resultado?.error) alert(resultado.error);
    setRestockId("");
    setPendienteId("");
  }

  const proveedores = Array.from(
    new Set(productos.map((p) => p.fabrica || p.proveedor).filter(Boolean)),
  );

  function mover(productoId: string, direccion: "arriba" | "abajo") {
    moverProducto(
      contenedorId,
      productos.map((p) => ({ id: p.id, orden: p.orden })),
      productoId,
      direccion,
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-zinc-700">Productos</p>
        <div className="flex items-center gap-3">
          {proveedores.length > 0 && (
            <p className="text-xs text-zinc-500">Proveedores: {proveedores.join(", ")}</p>
          )}
          <div className="flex overflow-hidden rounded-lg border border-zinc-300 text-xs">
            <button
              type="button"
              onClick={() => setVista("tabla")}
              className={`px-2.5 py-1 ${vista === "tabla" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600"}`}
            >
              Tabla
            </button>
            <button
              type="button"
              onClick={() => setVista("galeria")}
              className={`px-2.5 py-1 ${vista === "galeria" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600"}`}
            >
              Galería
            </button>
          </div>
        </div>
      </div>

      {productos.length > 0 && vista === "tabla" && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs text-zinc-500">
                <th className="py-2 pr-3 font-medium"></th>
                <th className="py-2 pr-3 font-medium"></th>
                <th className="py-2 pr-3 font-medium">SKU</th>
                <th className="py-2 pr-3 font-medium">Producto</th>
                <th className="py-2 pr-3 font-medium">Cant.</th>
                <th className="py-2 pr-3 font-medium">CBM</th>
                <th className="py-2 pr-3 font-medium">Costo final/pieza</th>
                <th className="py-2 pr-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {productos.map((producto, i) =>
                editandoId === producto.id ? (
                  <tr key={producto.id}>
                    <td colSpan={8} className="py-3">
                      <form
                        action={async (formData) => {
                          const resultado = await actualizarProducto(contenedorId, producto.id, formData);
                          if (resultado?.error) alert(resultado.error);
                          setEditandoId(null);
                        }}
                        className="rounded-lg border border-zinc-200 bg-zinc-50 p-4"
                      >
                        <CamposProducto
                          inicial={producto}
                          categorias={categoriasSugeridas}
                          fabricas={fabricasSugeridas}
                          proveedores={proveedoresSugeridos}
                        />
                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditandoId(null)}
                            className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
                          >
                            Guardar
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={producto.id}>
                    <td className="py-2 pr-1">
                      <div className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => mover(producto.id, "arriba")}
                          disabled={i === 0}
                          className="text-zinc-400 hover:text-zinc-900 disabled:opacity-20"
                          aria-label="Subir"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => mover(producto.id, "abajo")}
                          disabled={i === productos.length - 1}
                          className="text-zinc-400 hover:text-zinc-900 disabled:opacity-20"
                          aria-label="Bajar"
                        >
                          ▼
                        </button>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      {producto.imagen_url ? (
                        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-zinc-100">
                          <Image src={producto.imagen_url} alt={producto.nombre} fill className="object-cover" />
                        </div>
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-[9px] text-zinc-400">
                          Sin foto
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-zinc-500">{producto.sku}</td>
                    <td className="py-2 pr-3">
                      <div className="font-medium text-zinc-900">{producto.nombre}</div>
                      <div className="text-xs text-zinc-500">
                        {producto.categoria}
                        {producto.fabrica ? ` · ${producto.fabrica}` : ""}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      {producto.cantidad}{" "}
                      <span className="text-xs text-zinc-400">({cartones(producto).toFixed(1)} ctn)</span>
                    </td>
                    <td className="py-2 pr-3">{cbmProducto(producto).toFixed(3)}</td>
                    <td className="py-2 pr-3 font-medium text-zinc-900">
                      {formatoPesos(costoFinalPorPieza(producto, costoPorCbm, tipoCambioMercancia))}
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setEditandoId(producto.id)}
                        className="mr-2 text-zinc-400 hover:text-zinc-900"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => eliminarProducto(contenedorId, producto.id)}
                        className="text-zinc-400 hover:text-red-600"
                        aria-label="Quitar producto"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      {productos.length > 0 && vista === "galeria" && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {productos.map((producto) =>
            editandoId === producto.id ? (
              <div key={producto.id} className="col-span-2 rounded-lg border border-zinc-200 bg-zinc-50 p-4 sm:col-span-3">
                <form
                  action={async (formData) => {
                    const resultado = await actualizarProducto(contenedorId, producto.id, formData);
                    if (resultado?.error) alert(resultado.error);
                    setEditandoId(null);
                  }}
                >
                  <CamposProducto inicial={producto} />
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditandoId(null)}
                      className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
                    >
                      Guardar
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div key={producto.id} className="overflow-hidden rounded-lg border border-zinc-200">
                <div className="relative aspect-square bg-zinc-100">
                  {producto.imagen_url ? (
                    <Image
                      src={producto.imagen_url}
                      alt={producto.nombre}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-zinc-400">
                      Sin foto
                    </div>
                  )}
                  <div className="absolute top-1 right-1 flex gap-1">
                    <button
                      type="button"
                      onClick={() => setEditandoId(producto.id)}
                      className="rounded-full bg-white/90 px-1.5 py-0.5 text-xs text-zinc-500 hover:text-zinc-900"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onClick={() => eliminarProducto(contenedorId, producto.id)}
                      className="rounded-full bg-white/90 px-1.5 py-0.5 text-xs text-zinc-500 hover:text-red-600"
                      aria-label="Quitar producto"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="p-2">
                  <p className="truncate text-xs font-medium text-zinc-900">{producto.nombre}</p>
                  <p className="truncate font-mono text-[11px] text-zinc-400">{producto.sku}</p>
                  <p className="mt-1 text-xs font-semibold text-zinc-900">
                    {formatoPesos(costoFinalPorPieza(producto, costoPorCbm, tipoCambioMercancia))}
                  </p>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      <form
        key={`${productos.length}-${restockId}-${pendienteId}`}
        action={alAgregar}
        className="mt-4 space-y-3 border-t border-zinc-100 pt-4"
      >
        <p className="text-xs font-medium text-zinc-500">Agregar producto</p>

        {pendientesChina.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-amber-700">
              ¿Es mercancía pendiente de China?
            </label>
            <div className="mt-1">
              <Selector
                key={`pendiente-${pendienteId}`}
                defaultValue={pendienteId}
                onChange={(v) => {
                  setPendienteId(v);
                  setRestockId("");
                }}
                placeholder="— No, es otra cosa —"
                claseTrigger="flex w-full items-center justify-between gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-left text-sm transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200 focus:outline-none"
                opciones={[
                  { value: "", label: "— No, es otra cosa —" },
                  ...pendientesChina.map((p) => ({
                    value: p.id,
                    label: `${p.sku} — ${p.nombre} (${p.cantidad_pendiente} pzas pendientes)`,
                  })),
                ]}
              />
            </div>
          </div>
        )}

        {catalogo.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-zinc-500">
              ¿Es un producto que ya has traído antes? (restock)
            </label>
            <div className="mt-1">
              <Selector
                key={`restock-${restockId}`}
                defaultValue={restockId}
                onChange={(v) => {
                  setRestockId(v);
                  setPendienteId("");
                }}
                placeholder="— Producto nuevo, llenar desde cero —"
                opciones={[
                  { value: "", label: "— Producto nuevo, llenar desde cero —" },
                  ...catalogo.map((p) => ({ value: p.id, label: `${p.sku} — ${p.nombre}` })),
                ]}
              />
            </div>
          </div>
        )}

        {pendiente && <input type="hidden" name="pendiente_origen_id" value={pendiente.id} />}

        <CamposProducto
          inicial={
            pendiente
              ? {
                  categoria: pendiente.categoria ?? "",
                  fabrica: pendiente.fabrica,
                  proveedor: pendiente.proveedor,
                  imagen_url: pendiente.imagen_url,
                  sku: pendiente.sku,
                  nombre: pendiente.nombre,
                  memo: pendiente.memo,
                  cantidad: pendiente.cantidad_pendiente,
                  precio_dolares: pendiente.precio_dolares,
                  piezas_por_caja: pendiente.piezas_por_caja,
                  largo_cm: pendiente.largo_cm,
                  ancho_cm: pendiente.ancho_cm,
                  alto_cm: pendiente.alto_cm,
                }
              : productoRestock
          }
          esRestock={Boolean(productoRestock) && !pendiente}
          fabricaPorDefecto={fabricaPrincipal}
          proveedorPorDefecto={proveedorPrincipal}
          categoriaPorDefecto={!productoRestock && !pendiente ? categoriaPorDefecto : undefined}
          categorias={categoriasSugeridas}
          fabricas={fabricasSugeridas}
          proveedores={proveedoresSugeridos}
        />
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            + Agregar producto
          </button>
        </div>
      </form>
    </div>
  );
}

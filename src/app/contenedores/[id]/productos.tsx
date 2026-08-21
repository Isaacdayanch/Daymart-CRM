"use client";

import { CampoNumero } from "@/components/campo-numero";
import { formatoPesos } from "@/lib/formato";
import { cartones, cbmProducto, costoFinalPorPieza } from "@/lib/calculos";
import type { Producto } from "@/lib/tipos";
import { agregarProducto, eliminarProducto } from "./actions";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export function Productos({
  contenedorId,
  productos,
  costoPorCbm,
  tipoCambioMercancia,
}: {
  contenedorId: string;
  productos: Producto[];
  costoPorCbm: number;
  tipoCambioMercancia: number;
}) {
  const agregar = agregarProducto.bind(null, contenedorId);

  const proveedores = Array.from(
    new Set(productos.map((p) => p.fabrica || p.proveedor).filter(Boolean)),
  );

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-zinc-700">Productos</p>
        {proveedores.length > 0 && (
          <p className="text-xs text-zinc-500">Proveedores en este contenedor: {proveedores.join(", ")}</p>
        )}
      </div>

      {productos.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs text-zinc-500">
                <th className="py-2 pr-3 font-medium">SKU</th>
                <th className="py-2 pr-3 font-medium">Producto</th>
                <th className="py-2 pr-3 font-medium">Cant.</th>
                <th className="py-2 pr-3 font-medium">CBM</th>
                <th className="py-2 pr-3 font-medium">Costo final/pieza</th>
                <th className="py-2 pr-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {productos.map((producto) => (
                <tr key={producto.id}>
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
                  <td className="py-2 pr-3 text-right">
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form action={agregar} className="mt-4 space-y-3 border-t border-zinc-100 pt-4">
        <p className="text-xs font-medium text-zinc-500">Agregar producto</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Categoría</label>
            <input type="text" name="categoria" required className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Fábrica</label>
            <input type="text" name="fabrica" className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Proveedor / contacto</label>
            <input type="text" name="proveedor" className={claseCampo} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Nombre del producto</label>
            <input type="text" name="nombre" required className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">
              SKU (déjalo vacío para autogenerarlo)
            </label>
            <input type="text" name="sku" className={claseCampo} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-500">Memo / detalles para el proveedor</label>
          <input type="text" name="memo" placeholder="Color, código, comentario..." className={claseCampo} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Cantidad</label>
            <CampoNumero name="cantidad" className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Precio USD</label>
            <CampoNumero name="precio_dolares" className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Piezas por caja</label>
            <CampoNumero name="piezas_por_caja" className={claseCampo} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Largo (cm)</label>
            <CampoNumero name="largo_cm" className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Ancho (cm)</label>
            <CampoNumero name="ancho_cm" className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Alto (cm)</label>
            <CampoNumero name="alto_cm" className={claseCampo} />
          </div>
        </div>

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

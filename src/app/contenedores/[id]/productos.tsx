"use client";

import { useState } from "react";
import Image from "next/image";
import { CampoNumero } from "@/components/campo-numero";
import { CampoImagen } from "@/components/campo-imagen";
import { formatoPesos } from "@/lib/formato";
import { cartones, cbmProducto, costoFinalPorPieza, skuSugerido } from "@/lib/calculos";
import type { Producto } from "@/lib/tipos";
import { agregarProducto, eliminarProducto } from "./actions";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export function Productos({
  contenedorId,
  productos,
  costoPorCbm,
  tipoCambioMercancia,
  fabricaPrincipal,
  proveedorPrincipal,
}: {
  contenedorId: string;
  productos: Producto[];
  costoPorCbm: number;
  tipoCambioMercancia: number;
  fabricaPrincipal: string | null;
  proveedorPrincipal: string | null;
}) {
  const [vista, setVista] = useState<"tabla" | "galeria">("tabla");
  const agregar = agregarProducto.bind(null, contenedorId);

  const [categoria, setCategoria] = useState("");
  const [nombre, setNombre] = useState("");
  const [sku, setSku] = useState("");
  const [skuEditadoManualmente, setSkuEditadoManualmente] = useState(false);

  function alCambiarCategoria(valor: string) {
    setCategoria(valor);
    if (!skuEditadoManualmente) setSku(skuSugerido(valor, nombre));
  }

  function alCambiarNombre(valor: string) {
    setNombre(valor);
    if (!skuEditadoManualmente) setSku(skuSugerido(categoria, valor));
  }

  const proveedores = Array.from(
    new Set(productos.map((p) => p.fabrica || p.proveedor).filter(Boolean)),
  );

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

      {productos.length > 0 && vista === "galeria" && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {productos.map((producto) => (
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
                <button
                  type="button"
                  onClick={() => eliminarProducto(contenedorId, producto.id)}
                  className="absolute top-1 right-1 rounded-full bg-white/90 px-1.5 py-0.5 text-xs text-zinc-500 hover:text-red-600"
                  aria-label="Quitar producto"
                >
                  ✕
                </button>
              </div>
              <div className="p-2">
                <p className="truncate text-xs font-medium text-zinc-900">{producto.nombre}</p>
                <p className="truncate font-mono text-[11px] text-zinc-400">{producto.sku}</p>
                <p className="mt-1 text-xs font-semibold text-zinc-900">
                  {formatoPesos(costoFinalPorPieza(producto, costoPorCbm, tipoCambioMercancia))}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <form key={productos.length} action={agregar} className="mt-4 space-y-3 border-t border-zinc-100 pt-4">
        <p className="text-xs font-medium text-zinc-500">Agregar producto</p>

        <CampoImagen name="imagen" />

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Categoría</label>
            <input
              type="text"
              name="categoria"
              required
              value={categoria}
              onChange={(e) => alCambiarCategoria(e.target.value)}
              className={claseCampo}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Fábrica</label>
            <input
              type="text"
              name="fabrica"
              defaultValue={fabricaPrincipal ?? ""}
              className={claseCampo}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Proveedor / contacto</label>
            <input
              type="text"
              name="proveedor"
              defaultValue={proveedorPrincipal ?? ""}
              className={claseCampo}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Nombre del producto</label>
            <input
              type="text"
              name="nombre"
              required
              value={nombre}
              onChange={(e) => alCambiarNombre(e.target.value)}
              className={claseCampo}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">SKU (se sugiere solo, edítalo si quieres)</label>
            <input
              type="text"
              name="sku"
              value={sku}
              onChange={(e) => {
                setSkuEditadoManualmente(true);
                setSku(e.target.value);
              }}
              className={`${claseCampo} font-mono`}
            />
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

"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { cartones, cbmProducto, costoFinalPorPieza } from "@/lib/calculos";
import { ESTILO_ESTADO, formatoCajas, formatoPesos } from "@/lib/formato";
import { ESTADOS_CONTENEDOR, type Contenedor, type Producto } from "@/lib/tipos";

interface Grupo {
  contenedor: Contenedor;
  productos: Producto[];
  costoPorCbm: number;
  tipoCambioMercancia: number;
}

function etiquetaEstado(estado: Contenedor["estado"]) {
  return ESTADOS_CONTENEDOR.find((e) => e.valor === estado)?.etiqueta ?? estado;
}

export function VistaProductos({ grupos, verDinero }: { grupos: Grupo[]; verDinero: boolean }) {
  const [vista, setVista] = useState<"lista" | "galeria">("lista");

  const totalProductos = grupos.reduce((s, g) => s + g.productos.length, 0);
  const totalPiezas = grupos.reduce((s, g) => s + g.productos.reduce((a, p) => a + p.cantidad, 0), 0);
  const totalCbm = grupos.reduce((s, g) => s + g.productos.reduce((a, p) => a + cbmProducto(p), 0), 0);

  if (totalProductos === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center">
        <p className="text-base font-medium text-zinc-900">No hay productos que mostrar</p>
        <p className="mt-1 text-sm text-zinc-500">Aquí se ven todos los productos de tus contenedores, del más nuevo al más viejo.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          <span className="font-semibold text-zinc-900">{totalProductos}</span> productos ·{" "}
          <span className="font-semibold text-zinc-900">{totalPiezas.toLocaleString("es-MX")}</span> piezas ·{" "}
          <span className="font-semibold text-zinc-900">{totalCbm.toFixed(2)}</span> m³ en {grupos.length}{" "}
          {grupos.length === 1 ? "contenedor" : "contenedores"}
        </p>
        <div className="flex overflow-hidden rounded-lg border border-zinc-300 text-xs">
          <button
            type="button"
            onClick={() => setVista("lista")}
            className={`px-2.5 py-1 ${vista === "lista" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600"}`}
          >
            Lista
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

      {grupos
        .filter((g) => g.productos.length > 0)
        .map(({ contenedor, productos, costoPorCbm, tipoCambioMercancia }) => {
          const piezas = productos.reduce((s, p) => s + p.cantidad, 0);
          const cbm = productos.reduce((s, p) => s + cbmProducto(p), 0);
          return (
            <section key={contenedor.id} className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
                <div className="flex items-center gap-3">
                  <Link href={`/contenedores/${contenedor.id}`} className="text-base font-semibold text-zinc-900 hover:underline">
                    Contenedor {contenedor.numero}
                  </Link>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${ESTILO_ESTADO[contenedor.estado]}`}>
                    {etiquetaEstado(contenedor.estado)}
                  </span>
                  {(contenedor.fabrica_principal || contenedor.proveedor_principal) && (
                    <span className="text-xs text-zinc-400">
                      {[contenedor.fabrica_principal, contenedor.proveedor_principal].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500">
                  {productos.length} {productos.length === 1 ? "producto" : "productos"} · {piezas.toLocaleString("es-MX")} pzas ·{" "}
                  {cbm.toFixed(2)} m³
                </p>
              </div>

              {vista === "lista" ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-100 text-xs text-zinc-400">
                        <th className="px-5 py-2 font-medium"></th>
                        <th className="px-3 py-2 font-medium">Producto</th>
                        <th className="px-3 py-2 font-medium">SKU</th>
                        <th className="px-3 py-2 font-medium">Categoría</th>
                        <th className="px-3 py-2 text-right font-medium">Piezas</th>
                        <th className="px-3 py-2 text-right font-medium">Cajas</th>
                        <th className="px-3 py-2 text-right font-medium">CBM</th>
                        {verDinero && <th className="px-3 py-2 text-right font-medium">Costo/pza</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                      {productos.map((p) => (
                        <tr key={p.id}>
                          <td className="px-5 py-2">
                            <div className="relative h-12 w-12 overflow-hidden rounded-lg bg-zinc-100">
                              {p.imagen_url ? (
                                <Image src={p.imagen_url} alt={p.nombre} fill className="object-cover" sizes="48px" />
                              ) : (
                                <div className="flex h-full items-center justify-center text-[9px] text-zinc-400">Sin foto</div>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-zinc-900">{p.nombre}</p>
                            {p.memo && <p className="text-xs text-zinc-400">{p.memo}</p>}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-zinc-500">{p.sku}</td>
                          <td className="px-3 py-2 text-xs text-zinc-500">{p.categoria}</td>
                          <td className="px-3 py-2 text-right font-semibold text-zinc-900">{p.cantidad.toLocaleString("es-MX")}</td>
                          <td className="px-3 py-2 text-right text-xs text-zinc-500">{formatoCajas(cartones(p))}</td>
                          <td className="px-3 py-2 text-right text-xs text-zinc-500">{cbmProducto(p).toFixed(3)}</td>
                          {verDinero && (
                            <td className="px-3 py-2 text-right text-zinc-700">
                              {formatoPesos(costoFinalPorPieza(p, costoPorCbm, tipoCambioMercancia))}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
                  {productos.map((p) => (
                    <div key={p.id} className="overflow-hidden rounded-lg border border-zinc-200">
                      <div className="relative aspect-square bg-zinc-100">
                        {p.imagen_url ? (
                          <Image src={p.imagen_url} alt={p.nombre} fill className="object-cover" sizes="(min-width: 640px) 25vw, 50vw" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-zinc-400">Sin foto</div>
                        )}
                        <span className="absolute right-1 bottom-1 rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-zinc-900">
                          {p.cantidad.toLocaleString("es-MX")} pzas
                        </span>
                      </div>
                      <div className="p-2">
                        <p className="truncate text-sm font-medium text-zinc-900">{p.nombre}</p>
                        <p className="truncate font-mono text-[11px] text-zinc-400">{p.sku}</p>
                        {verDinero && (
                          <p className="mt-0.5 text-xs text-zinc-600">
                            {formatoPesos(costoFinalPorPieza(p, costoPorCbm, tipoCambioMercancia))}/pza
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
    </div>
  );
}

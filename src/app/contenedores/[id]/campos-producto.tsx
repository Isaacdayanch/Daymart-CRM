"use client";

import { useState } from "react";
import { CampoNumero } from "@/components/campo-numero";
import { CampoImagen } from "@/components/campo-imagen";
import { skuSugerido } from "@/lib/calculos";
import type { Producto } from "@/lib/tipos";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

/** Campos del formulario de producto, reutilizados para agregar y para editar. */
export function CamposProducto({
  inicial,
  fabricaPorDefecto,
  proveedorPorDefecto,
}: {
  inicial?: Producto;
  fabricaPorDefecto?: string | null;
  proveedorPorDefecto?: string | null;
}) {
  const [categoria, setCategoria] = useState(inicial?.categoria ?? "");
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [sku, setSku] = useState(inicial?.sku ?? "");
  const [skuEditadoManualmente, setSkuEditadoManualmente] = useState(Boolean(inicial?.sku));

  function alCambiarCategoria(valor: string) {
    setCategoria(valor);
    if (!skuEditadoManualmente) setSku(skuSugerido(valor, nombre));
  }

  function alCambiarNombre(valor: string) {
    setNombre(valor);
    if (!skuEditadoManualmente) setSku(skuSugerido(categoria, valor));
  }

  return (
    <div className="space-y-3">
      <CampoImagen name="imagen" valorInicial={inicial?.imagen_url} />

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
            defaultValue={inicial?.fabrica ?? fabricaPorDefecto ?? ""}
            className={claseCampo}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Proveedor / contacto</label>
          <input
            type="text"
            name="proveedor"
            defaultValue={inicial?.proveedor ?? proveedorPorDefecto ?? ""}
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
        <input
          type="text"
          name="memo"
          defaultValue={inicial?.memo ?? ""}
          placeholder="Color, código, comentario..."
          className={claseCampo}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Cantidad</label>
          <CampoNumero name="cantidad" defaultValue={inicial?.cantidad} className={claseCampo} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Precio USD</label>
          <CampoNumero name="precio_dolares" defaultValue={inicial?.precio_dolares} className={claseCampo} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Piezas por caja</label>
          <CampoNumero name="piezas_por_caja" defaultValue={inicial?.piezas_por_caja} className={claseCampo} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Largo (cm)</label>
          <CampoNumero name="largo_cm" defaultValue={inicial?.largo_cm} className={claseCampo} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Ancho (cm)</label>
          <CampoNumero name="ancho_cm" defaultValue={inicial?.ancho_cm} className={claseCampo} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Alto (cm)</label>
          <CampoNumero name="alto_cm" defaultValue={inicial?.alto_cm} className={claseCampo} />
        </div>
      </div>
    </div>
  );
}

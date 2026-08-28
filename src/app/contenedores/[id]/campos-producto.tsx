"use client";

import { useState } from "react";
import { CampoNumero } from "@/components/campo-numero";
import { CampoImagen } from "@/components/campo-imagen";
import { CampoSugerencias } from "@/components/campo-sugerencias";
import { skuSugerido } from "@/lib/calculos";
import type { Producto } from "@/lib/tipos";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

/** Campos del formulario de producto, reutilizados para agregar y para editar. */
export function CamposProducto({
  inicial,
  fabricaPorDefecto,
  proveedorPorDefecto,
  categoriaPorDefecto,
  categorias = [],
  fabricas = [],
  proveedores = [],
  esRestock = false,
}: {
  inicial?: Partial<Producto>;
  fabricaPorDefecto?: string | null;
  proveedorPorDefecto?: string | null;
  /** Categoría del último producto agregado a este contenedor — casi
   * siempre se repite, así que se precarga en productos nuevos. */
  categoriaPorDefecto?: string | null;
  categorias?: string[];
  fabricas?: string[];
  proveedores?: string[];
  /** true cuando se rellenan los campos a partir de un producto anterior
   * (restock): no se carga la cantidad ni el id, solo los datos fijos. */
  esRestock?: boolean;
}) {
  const [categoria, setCategoria] = useState(inicial?.categoria ?? categoriaPorDefecto ?? "");
  const [fabrica, setFabrica] = useState(inicial?.fabrica ?? fabricaPorDefecto ?? "");
  const [proveedor, setProveedor] = useState(inicial?.proveedor ?? proveedorPorDefecto ?? "");
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [sku, setSku] = useState(inicial?.sku ?? skuSugerido(categoriaPorDefecto ?? "", ""));
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
      {inicial?.imagen_url && (
        <input type="hidden" name="imagen_url_previa" value={inicial.imagen_url} />
      )}

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Categoría</label>
          <CampoSugerencias
            name="categoria"
            required
            value={categoria}
            onChange={alCambiarCategoria}
            sugerencias={categorias}
            className={claseCampo}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Fábrica</label>
          <CampoSugerencias
            name="fabrica"
            value={fabrica}
            onChange={setFabrica}
            sugerencias={fabricas}
            className={claseCampo}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Proveedor / contacto</label>
          <CampoSugerencias
            name="proveedor"
            value={proveedor}
            onChange={setProveedor}
            sugerencias={proveedores}
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
          <CampoNumero
            name="cantidad"
            defaultValue={esRestock ? undefined : inicial?.cantidad}
            className={claseCampo}
          />
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

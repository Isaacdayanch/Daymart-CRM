"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoImagen } from "@/components/campo-imagen";
import { actualizarProductoGlobal } from "../../actions";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

/** Datos mínimos para prellenar el formulario — no requiere una fila real
 * en "productos" (hay SKUs cargados con "Agregar stock manual"/"Carga
 * masiva" que solo existen en movimientos_stock, y aun así deben poder
 * editarse desde aquí). */
interface DatosProducto {
  sku: string;
  nombre: string;
  imagen_url: string | null;
  categoria: string | null;
  piezas_por_caja: number;
  fabrica: string | null;
  proveedor: string | null;
}

export function EditarProductoGlobal({ sku, producto }: { sku: string; producto: DatosProducto }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="shrink-0 text-xs font-medium text-zinc-500 hover:text-zinc-900"
      >
        Editar producto →
      </button>
    );
  }

  return (
    <form
      action={async (formData) => {
        setEnviando(true);
        setError(null);
        const resultado = await actualizarProductoGlobal(sku, formData);
        setEnviando(false);
        if (resultado?.error) {
          setError(resultado.error);
        } else {
          setEditando(false);
          if (resultado?.skuNuevo && resultado.skuNuevo !== sku) {
            router.push(`/stock/producto/${encodeURIComponent(resultado.skuNuevo)}`);
          } else {
            router.refresh();
          }
        }
      }}
      className="w-full space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4"
    >
      <p className="text-xs font-medium text-amber-700">
        Esto corrige el producto en TODOS los contenedores donde lo has traído, no solo aquí.
      </p>
      <div className="flex items-start gap-4">
        <CampoImagen name="imagen" valorInicial={producto.imagen_url} />
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-zinc-500">SKU</label>
            <input type="text" name="sku" defaultValue={producto.sku} required className={`${claseCampo} font-mono`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Nombre</label>
            <input type="text" name="nombre" defaultValue={producto.nombre} required className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Categoría</label>
            <input type="text" name="categoria" defaultValue={producto.categoria ?? ""} className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Piezas por caja</label>
            <input
              type="number"
              name="piezas_por_caja"
              min={1}
              defaultValue={producto.piezas_por_caja || 1}
              className={claseCampo}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Fábrica</label>
            <input type="text" name="fabrica" defaultValue={producto.fabrica ?? ""} className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Proveedor</label>
            <input type="text" name="proveedor" defaultValue={producto.proveedor ?? ""} className={claseCampo} />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setEditando(false)}
          className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={enviando}
          className="rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {enviando ? "Guardando..." : "Guardar en todos los contenedores"}
        </button>
      </div>
    </form>
  );
}

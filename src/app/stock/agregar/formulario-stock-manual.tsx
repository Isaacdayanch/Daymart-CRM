"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoImagen } from "@/components/campo-imagen";
import type { Bodega, Producto } from "@/lib/tipos";
import { agregarStockManual } from "../actions";

export function FormularioStockManual({ bodegas, catalogo }: { bodegas: Bodega[]; catalogo: Producto[] }) {
  const router = useRouter();
  const [sku, setSku] = useState("");
  const [error, setError] = useState<string | null>(null);
  const productoCatalogo = catalogo.find((p) => p.sku === sku);

  return (
    <form
      key={sku}
      action={async (formData) => {
        const resultado = await agregarStockManual(formData);
        if (resultado?.error) {
          setError(resultado.error);
        } else {
          setError(null);
          router.push("/stock");
        }
      }}
      className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
    >
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-start gap-4">
        <div className="shrink-0">
          <CampoImagen name="imagen" valorInicial={productoCatalogo?.imagen_url} />
          <input type="hidden" name="imagen_url_previa" value={productoCatalogo?.imagen_url ?? ""} />
        </div>
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-zinc-500">SKU</label>
            <input
              type="text"
              name="sku"
              list="catalogo-skus"
              required
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono focus:border-zinc-500 focus:ring-zinc-500"
            />
            <datalist id="catalogo-skus">
              {catalogo.map((p) => (
                <option key={p.sku} value={p.sku}>
                  {p.nombre}
                </option>
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Nombre del producto</label>
            <input
              type="text"
              name="nombre"
              required
              defaultValue={productoCatalogo?.nombre ?? ""}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
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
        <div>
          <label className="block text-xs font-medium text-zinc-500">Cantidad (piezas)</label>
          <input
            type="number"
            name="cantidad"
            min={1}
            required
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Piezas por caja</label>
          <input
            type="number"
            name="piezas_por_caja"
            min={1}
            defaultValue={productoCatalogo?.piezas_por_caja ?? 1}
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Costo por pieza (pesos)</label>
          <input
            type="number"
            name="costo_unitario_pesos"
            min={0}
            step="0.01"
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-500">Nota</label>
        <input
          type="text"
          name="referencia"
          placeholder="Ej. Contenedor 10 — carga inicial de inventario"
          className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
        />
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700"
        >
          Agregar a stock
        </button>
      </div>
    </form>
  );
}

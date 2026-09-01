"use client";

import { useState } from "react";
import { CampoSugerencias } from "@/components/campo-sugerencias";
import { Selector } from "@/components/selector";
import type { Bodega, Producto } from "@/lib/tipos";
import { agregarStockManualLote } from "../actions";

interface Linea {
  id: string;
  sku: string;
  nombre: string;
  cantidad: number;
  costoUnitarioPesos: number;
  piezasPorCaja: number;
}

export function FormularioCargaMasiva({ bodegas, catalogo }: { bodegas: Bodega[]; catalogo: Producto[] }) {
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [sku, setSku] = useState("");
  const [nombre, setNombre] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [costo, setCosto] = useState("");
  const [piezasPorCaja, setPiezasPorCaja] = useState("1");
  const [bodegaId, setBodegaId] = useState(bodegas[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [exito, setExito] = useState<string | null>(null);

  const productoCatalogo = catalogo.find((p) => p.sku === sku);

  function elegirSku(valor: string) {
    setSku(valor);
    const p = catalogo.find((c) => c.sku === valor);
    if (p) {
      setNombre(p.nombre);
      setPiezasPorCaja(String(p.piezas_por_caja || 1));
    }
  }

  function agregarLinea() {
    if (!sku.trim() || !nombre.trim() || Number(cantidad) <= 0) {
      setError("Pon el SKU, el nombre y una cantidad válida.");
      return;
    }
    setError(null);
    setLineas((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        sku: sku.trim(),
        nombre: nombre.trim(),
        cantidad: Number(cantidad),
        costoUnitarioPesos: Number(costo) || 0,
        piezasPorCaja: Number(piezasPorCaja) || 1,
      },
    ]);
    setSku("");
    setNombre("");
    setCantidad("");
    setCosto("");
    setPiezasPorCaja("1");
  }

  function quitarLinea(id: string) {
    setLineas((prev) => prev.filter((l) => l.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Agregar producto a la lista</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-zinc-500">SKU (el que quieras usar de hoy en adelante)</label>
            <CampoSugerencias
              value={sku}
              onChange={elegirSku}
              sugerencias={catalogo.map((p) => p.sku)}
              placeholder="Ej. GYM-BANC-ABS-ROJO"
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono focus:border-zinc-500 focus:ring-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Nombre del producto</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
            />
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Cantidad (piezas)</label>
            <input
              type="number"
              min={1}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Costo por pieza (pesos, opcional)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
              placeholder="0"
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Piezas por caja</label>
            <input
              type="number"
              min={1}
              value={piezasPorCaja}
              onChange={(e) => setPiezasPorCaja(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
            />
          </div>
        </div>

        {productoCatalogo && (
          <p className="mt-2 text-xs text-zinc-400">Ya existe este SKU en tu catálogo — se va a sumar a lo que ya tenga.</p>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={agregarLinea}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
          >
            + Agregar a la lista
          </button>
        </div>
      </div>

      {lineas.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 p-6">
            <label className="block text-xs font-medium text-zinc-500">Bodega para toda esta carga</label>
            <div className="mt-1 max-w-xs">
              <Selector
                defaultValue={bodegaId}
                onChange={setBodegaId}
                opciones={bodegas.map((b) => ({ value: b.id, label: b.nombre }))}
              />
            </div>
          </div>
          <div className="divide-y divide-zinc-100">
            {lineas.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 px-6 py-3">
                <div>
                  <p className="text-sm font-medium text-zinc-900">{l.nombre}</p>
                  <p className="font-mono text-xs text-zinc-400">
                    {l.sku}
                    {l.costoUnitarioPesos > 0 ? ` · $${l.costoUnitarioPesos.toLocaleString("es-MX")}/pza` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-zinc-900">{l.cantidad}</span>
                  <button
                    type="button"
                    onClick={() => quitarLinea(l.id)}
                    className="text-zinc-400 hover:text-red-600"
                    aria-label="Quitar línea"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-zinc-100 p-6">
            {exito && <p className="text-sm text-emerald-600">{exito}</p>}
            <div className="ml-auto">
              <button
                type="button"
                disabled={enviando}
                onClick={async () => {
                  setEnviando(true);
                  setExito(null);
                  const formData = new FormData();
                  formData.set("bodega_id", bodegaId ?? "");
                  formData.set(
                    "lineas",
                    JSON.stringify(
                      lineas.map((l) => ({
                        sku: l.sku,
                        nombre: l.nombre,
                        cantidad: l.cantidad,
                        costoUnitarioPesos: l.costoUnitarioPesos,
                        piezasPorCaja: l.piezasPorCaja,
                      })),
                    ),
                  );
                  const resultado = await agregarStockManualLote(formData);
                  setEnviando(false);
                  if (resultado?.error) {
                    setError(resultado.error);
                  } else {
                    setExito(`Se cargaron ${lineas.length} producto(s) a stock.`);
                    setLineas([]);
                  }
                }}
                className="rounded-xl bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 disabled:opacity-50"
              >
                {enviando ? "Guardando..." : `Cargar todo (${lineas.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

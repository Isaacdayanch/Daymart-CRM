"use client";

import { useState } from "react";
import { CATEGORIAS_SALIDA, type Bodega } from "@/lib/tipos";
import { registrarSalidasLote } from "../actions";

interface Opcion {
  sku: string;
  nombre: string;
  stockActual: number;
  piezasPorCaja: number;
  imagenUrl: string | null;
}

interface Linea extends Opcion {
  id: string;
  cantidad: number;
  categoria: string;
  colorFull: string;
  notas: string;
}

const COLORES_FULL = ["Verde", "Morado", "Blanco", "Azul", "Naranja", "Amarillo", "Rosa", "Negro", "Gris"];

export function FormularioSalidas({ opciones, bodegas }: { opciones: Opcion[]; bodegas: Bodega[] }) {
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [sku, setSku] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [categoria, setCategoria] = useState<string>("");
  const [colorFull, setColorFull] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [exito, setExito] = useState<string | null>(null);

  const opcionActual = opciones.find((o) => o.sku === sku);

  function agregarLinea() {
    if (!opcionActual || !categoria || Number(cantidad) <= 0) {
      setError("Elige el producto, la categoría y una cantidad válida.");
      return;
    }
    setError(null);
    setLineas((prev) => [
      ...prev,
      {
        ...opcionActual,
        id: crypto.randomUUID(),
        cantidad: Number(cantidad),
        categoria,
        colorFull,
        notas,
      },
    ]);
    setSku("");
    setCantidad("1");
    setColorFull("");
    setNotas("");
  }

  function quitarLinea(id: string) {
    setLineas((prev) => prev.filter((l) => l.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Agregar salida</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Producto</label>
            <select
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
            >
              <option value="">Selecciona un producto</option>
              {opciones.map((o) => (
                <option key={o.sku} value={o.sku}>
                  {o.nombre} — {o.stockActual} en stock
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Categoría</label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
            >
              <option value="">Selecciona</option>
              {CATEGORIAS_SALIDA.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Cantidad</label>
            <input
              type="number"
              min={1}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
            />
          </div>
          {categoria === "Full" && (
            <div>
              <label className="block text-xs font-medium text-zinc-500">Color de la etiqueta del Full</label>
              <input
                type="text"
                list="colores-full"
                value={colorFull}
                onChange={(e) => setColorFull(e.target.value)}
                placeholder="Ej. Azul"
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
              />
              <datalist id="colores-full">
                {COLORES_FULL.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          )}
        </div>

        <div className="mt-3">
          <label className="block text-xs font-medium text-zinc-500">Notas (opcional)</label>
          <input
            type="text"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Cualquier dato extra"
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
          />
        </div>

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
            <label className="block text-xs font-medium text-zinc-500">Bodega de esta tanda</label>
            <select
              id="bodega-lote"
              defaultValue={bodegas[0]?.id}
              className="mt-1 block w-full max-w-xs rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
            >
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="divide-y divide-zinc-100">
            {lineas.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 px-6 py-3">
                <div className="flex items-center gap-3">
                  {l.imagenUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura chica en una lista
                    <img src={l.imagenUrl} alt={l.nombre} className="h-10 w-10 rounded-lg object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-zinc-100" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{l.nombre}</p>
                    <p className="text-xs text-zinc-400">
                      {l.categoria}
                      {l.colorFull ? ` · ${l.colorFull}` : ""}
                      {l.notas ? ` · ${l.notas}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-sm font-semibold ${l.categoria === "Devolución" ? "text-emerald-600" : "text-zinc-900"}`}
                  >
                    {l.categoria === "Devolución" ? "+" : "-"}
                    {l.cantidad}
                  </span>
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
                  const bodegaId = (document.getElementById("bodega-lote") as HTMLSelectElement | null)?.value;
                  const formData = new FormData();
                  formData.set("bodega_id", bodegaId ?? "");
                  formData.set(
                    "lineas",
                    JSON.stringify(
                      lineas.map((l) => ({
                        sku: l.sku,
                        nombre: l.nombre,
                        cantidad: l.cantidad,
                        piezasPorCaja: l.piezasPorCaja,
                        imagenUrl: l.imagenUrl,
                        categoria: l.categoria,
                        colorFull: l.colorFull || null,
                        notas: l.notas || null,
                      })),
                    ),
                  );
                  const resultado = await registrarSalidasLote(formData);
                  setEnviando(false);
                  if (resultado?.error) {
                    setError(resultado.error);
                  } else {
                    setExito(`Se registraron ${lineas.length} salida(s).`);
                    setLineas([]);
                  }
                }}
                className="rounded-xl bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 disabled:opacity-50"
              >
                {enviando ? "Guardando..." : `Registrar salidas (${lineas.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

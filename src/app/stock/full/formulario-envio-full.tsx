"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoSugerencias } from "@/components/campo-sugerencias";
import { Selector } from "@/components/selector";
import type { Bodega } from "@/lib/tipos";
import { SelectorProducto } from "../salidas/selector-producto";
import { crearEnvioFull } from "./actions";

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
}

const COLORES_FULL = ["Verde", "Morado", "Blanco", "Azul", "Naranja", "Amarillo", "Rosa", "Negro", "Gris"];

/** "Nuevo envío a Full": lista de productos y cantidades que se van a
 * mandar. NO descuenta la bodega — eso pasa cuando Mercado Libre confirma. */
export function FormularioEnvioFull({ opciones, bodegas }: { opciones: Opcion[]; bodegas: Bodega[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [sku, setSku] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [color, setColor] = useState("");
  const [notas, setNotas] = useState("");
  const [bodegaId, setBodegaId] = useState(bodegas[0]?.id ?? "");
  const hoyTexto = new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(hoyTexto);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const opcionActual = opciones.find((o) => o.sku === sku);
  const claseCampo = "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
        + Nuevo envío a Full
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">Nuevo envío a Full</h3>
        <button type="button" onClick={() => setAbierto(false)} className="text-xs text-zinc-400 hover:text-zinc-700">
          Cerrar
        </button>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Esto NO descuenta tu bodega todavía. Cuando Mercado Libre confirme que lo recibió, te va a preguntar y ahí se hace la salida.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Producto</label>
          <SelectorProducto opciones={opciones} value={sku} onChange={setSku} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Piezas</label>
          <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={claseCampo} />
        </div>
        <button
          type="button"
          onClick={() => {
            if (!opcionActual || Number(cantidad) <= 0) {
              setError("Elige el producto y una cantidad válida.");
              return;
            }
            setError(null);
            setLineas((prev) => [...prev, { ...opcionActual, id: crypto.randomUUID(), cantidad: Number(cantidad) }]);
            setSku("");
            setCantidad("1");
          }}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          + Agregar
        </button>
      </div>

      {lineas.length > 0 && (
        <ul className="mt-4 divide-y divide-zinc-100 rounded-xl border border-zinc-100">
          {lineas.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <div className="flex items-center gap-3">
                {l.imagenUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- miniatura
                  <img src={l.imagenUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
                ) : (
                  <div className="h-9 w-9 rounded-lg bg-zinc-100" />
                )}
                <div>
                  <p className="font-medium text-zinc-900">{l.nombre}</p>
                  <p className="text-xs text-zinc-400">
                    {l.sku} · en bodega {l.stockActual.toLocaleString("es-MX")}
                    {l.cantidad > l.stockActual && <span className="text-amber-700"> · ojo: mandas más de lo que hay</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold">{l.cantidad}</span>
                <button type="button" onClick={() => setLineas((prev) => prev.filter((x) => x.id !== l.id))} className="text-zinc-400 hover:text-red-600" aria-label="Quitar">
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Color de etiqueta</label>
          <CampoSugerencias value={color} onChange={setColor} sugerencias={COLORES_FULL} placeholder="Ej. Azul" />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Fecha en que se va</label>
          <div className="mt-1">
            <CampoFecha defaultValue={fecha} onChange={setFecha} max={hoyTexto} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Bodega</label>
          <div className="mt-1">
            <Selector defaultValue={bodegaId} onChange={setBodegaId} opciones={bodegas.map((b) => ({ value: b.id, label: b.nombre }))} />
          </div>
        </div>
        <div className="sm:col-span-3">
          <label className="block text-xs font-medium text-zinc-500">Notas (opcional)</label>
          <input type="text" value={notas} onChange={(e) => setNotas(e.target.value)} className={claseCampo} placeholder="Ej. cita 12 sep 10 am" />
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={enviando || lineas.length === 0}
          onClick={async () => {
            setEnviando(true);
            setError(null);
            const fd = new FormData();
            fd.set("bodega_id", bodegaId);
            fd.set("color_etiqueta", color);
            fd.set("notas", notas);
            fd.set("fecha", fecha);
            fd.set("lineas", JSON.stringify(lineas.map((l) => ({ sku: l.sku, nombre: l.nombre, cantidad: l.cantidad, piezasPorCaja: l.piezasPorCaja, imagenUrl: l.imagenUrl }))));
            const r = await crearEnvioFull(fd);
            setEnviando(false);
            if (r?.error) setError(r.error);
            else {
              setLineas([]);
              setAbierto(false);
              router.refresh();
            }
          }}
          className="rounded-xl bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {enviando ? "Guardando…" : `Guardar envío (${lineas.reduce((s, l) => s + l.cantidad, 0)} pzas)`}
        </button>
      </div>
    </div>
  );
}

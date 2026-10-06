"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SelectorProducto } from "@/app/stock/salidas/selector-producto";
import { desvincularPublicacion, vincularPublicacion } from "../actions";
import { NuevoProductoMl, type CatalogoParaNuevo, type DatosMlParaProducto } from "./nuevo-producto-ml";

interface Opcion {
  sku: string;
  nombre: string;
  stockActual: number;
  imagenUrl: string | null;
}

/** Celda "Producto del CRM": muestra la liga (automática por SKU o manual)
 * o el botón para ligar con el selector de productos con foto. */
export function LigaProducto({
  itemId,
  variationId,
  sku,
  origen,
  nombre,
  opciones,
  datosMl,
  catalogo,
  piezasPorUnidad = 1,
}: {
  itemId: string;
  variationId: number | null;
  sku: string | null;
  origen: "auto" | "manual" | null;
  nombre: string | null;
  /** Piezas del CRM que son UNA unidad de esta publicación (2 = un par). */
  piezasPorUnidad?: number;
  opciones: Opcion[];
  /** Para "Nuevo producto con estos datos" (Fase C). */
  datosMl?: DatosMlParaProducto;
  catalogo?: CatalogoParaNuevo;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [elegido, setElegido] = useState(sku ?? "");
  const [factor, setFactor] = useState(String(piezasPorUnidad || 1));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (creando && datosMl && catalogo) {
    return <NuevoProductoMl datos={datosMl} catalogo={catalogo} alCerrar={() => setCreando(false)} />;
  }

  if (editando) {
    return (
      <div className="w-full space-y-1.5 lg:w-56">
        {/* El panel se abre hacia la izquierda y más ancho que la columna
            (que en compu mide 14rem): si no, la lista salía recortada y
            "corta y chiquita" (Isaac, 5 oct). */}
        <SelectorProducto opciones={opciones} value={elegido} onChange={setElegido} panelClase="right-0 w-full lg:w-[30rem]" />
        <label className="flex items-center gap-2 text-[11px] text-zinc-600">
          Piezas del CRM por unidad de ML
          <input type="number" min={1} step={1} value={factor} onChange={(e) => setFactor(e.target.value)} className="w-14 rounded-lg border border-zinc-300 px-2 py-1 text-xs" />
        </label>
        <p className="text-[10px] text-zinc-400">1 normal; 2 si en ML se vende por PAR y en tu bodega cuentas piezas sueltas (mancuernas).</p>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            disabled={!elegido || guardando}
            onClick={async () => {
              setGuardando(true);
              setError(null);
              const r = await vincularPublicacion(itemId, variationId, elegido, Number(factor) || 1);
              setGuardando(false);
              if (r.error) {
                setError(r.error);
                return;
              }
              setEditando(false);
              router.refresh();
            }}
            className="rounded-lg bg-zinc-900 px-3 py-1 font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {guardando ? "..." : "Ligar"}
          </button>
          <button type="button" onClick={() => setEditando(false)} className="text-zinc-500 hover:text-zinc-900">
            Cancelar
          </button>
        </div>
        {datosMl && catalogo && (
          <button
            type="button"
            onClick={() => {
              setEditando(false);
              setCreando(true);
            }}
            className="text-xs text-emerald-700 underline-offset-2 hover:underline"
          >
            ¿No está en el sistema? + Nuevo producto con estos datos
          </button>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  if (sku) {
    return (
      <div className="text-xs">
        <p className="font-medium text-zinc-900">{nombre ?? sku}</p>
        <p className="text-zinc-400">
          <span className="font-mono">{sku}</span>
          {origen === "auto" ? " · por SKU" : " · manual"}
          {piezasPorUnidad > 1 && <span className="font-medium text-violet-700"> · {piezasPorUnidad} pzas por unidad</span>}
          {" · "}
          <button type="button" onClick={() => setEditando(true)} className="text-zinc-500 hover:text-zinc-900">
            cambiar
          </button>
          {origen === "manual" && (
            <>
              {" · "}
              <button
                type="button"
                onClick={async () => {
                  const r = await desvincularPublicacion(itemId, variationId);
                  if (r.error) setError(r.error);
                  router.refresh();
                }}
                className="text-zinc-400 hover:text-red-600"
              >
                quitar
              </button>
            </>
          )}
        </p>
        {error && <p className="text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
      >
        Ligar con producto
      </button>
      {datosMl && catalogo && (
        <button type="button" onClick={() => setCreando(true)} className="text-[11px] text-emerald-700 underline-offset-2 hover:underline">
          + Nuevo producto con estos datos
        </button>
      )}
    </div>
  );
}

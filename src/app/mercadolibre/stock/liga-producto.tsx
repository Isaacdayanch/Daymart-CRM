"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SelectorProducto } from "@/app/stock/salidas/selector-producto";
import { desvincularPublicacion, vincularPublicacion } from "../actions";

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
}: {
  itemId: string;
  variationId: number | null;
  sku: string | null;
  origen: "auto" | "manual" | null;
  nombre: string | null;
  opciones: Opcion[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [elegido, setElegido] = useState(sku ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (editando) {
    return (
      <div className="w-64 space-y-1.5">
        <SelectorProducto opciones={opciones} value={elegido} onChange={setElegido} />
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            disabled={!elegido || guardando}
            onClick={async () => {
              setGuardando(true);
              setError(null);
              const r = await vincularPublicacion(itemId, variationId, elegido);
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
    <button
      type="button"
      onClick={() => setEditando(true)}
      className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
    >
      Ligar con producto
    </button>
  );
}

"use client";

import { useState } from "react";
import { SelectorProducto } from "@/app/stock/salidas/selector-producto";
import { ligarCodigoMl } from "../actions";

export type OpcionProducto = { sku: string; nombre: string; stockActual: number; imagenUrl: string | null };

/** Elegir a qué producto del CRM va un Código ML de Full. Es EL formulario de
 * ligar (21 oct): se usa en la vista previa del envío a Full y en Ligar. La
 * liga se guarda una vez y todo el sistema la usa. */
export function FormLigarCodigo({
  inventoryId,
  opciones,
  inicial,
  factorInicial = 1,
  alLigar,
  alCancelar,
}: {
  inventoryId: string;
  opciones: OpcionProducto[];
  /** Producto propuesto (la liga actual o la sugerencia por nombre). */
  inicial?: string | null;
  factorInicial?: number;
  alLigar: () => void | Promise<void>;
  alCancelar?: () => void;
}) {
  const [elegido, setElegido] = useState(inicial ?? "");
  const [factor, setFactor] = useState(String(factorInicial || 1));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ligar() {
    setGuardando(true);
    setError(null);
    const r = await ligarCodigoMl(inventoryId, elegido, Number(factor) || 1);
    setGuardando(false);
    if (r.error) setError(r.error);
    else await alLigar();
  }

  return (
    <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/60 p-2 text-xs">
      <SelectorProducto opciones={opciones} value={elegido} onChange={setElegido} panelClase="left-0 w-full min-w-72" />
      <label className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-600">
        Piezas de tu bodega por unidad de ML
        <input type="number" min={1} step={1} value={factor} onChange={(e) => setFactor(e.target.value)} className="w-14 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs" />
        <span className="text-zinc-400">(1 casi siempre; 2 si ML vende el par y tú cuentas piezas sueltas, como las mancuernas)</span>
      </label>
      <div className="flex items-center gap-3">
        <button type="button" disabled={!elegido || guardando} onClick={ligar} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {guardando ? "Ligando…" : "Ligar"}
        </button>
        {alCancelar && (
          <button type="button" onClick={alCancelar} className="text-zinc-500 hover:text-zinc-900">
            Cancelar
          </button>
        )}
        <span className="text-[11px] text-zinc-400">
          Código ML <span className="font-mono">{inventoryId}</span>: se queda guardado para siempre.
        </span>
      </div>
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}

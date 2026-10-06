"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoMonto } from "@/components/campo-monto";
import { formatoPesos } from "@/lib/formato";
import { fijarPrecioVendedor } from "./actions";

/** "Tu precio" en la tarjeta del vendedor: puede subirlo por encima del
 * mínimo autorizado por Daymart (nunca bajarlo). Lo que suba es suyo. */
export function PrecioVendedor({ token, sku, minimo, actual }: { token: string; sku: string; minimo: number; actual: number | null }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(actual ?? minimo));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vigente = actual && actual > minimo ? actual : minimo;

  async function guardar(precio: number | null) {
    setGuardando(true);
    setError(null);
    const r = await fijarPrecioVendedor(token, sku, precio);
    setGuardando(false);
    if (r.error) setError(r.error);
    else {
      setEditando(false);
      router.refresh();
    }
  }

  if (!editando) {
    return (
      <div>
        <p className="text-[11px] uppercase tracking-wide text-zinc-400">Tu precio</p>
        <p className="text-lg font-semibold text-zinc-900">{formatoPesos(vigente)}</p>
        <button type="button" onClick={() => setEditando(true)} className="text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline">
          {actual && actual > minimo ? "cambiar" : "subir precio"}
        </button>
      </div>
    );
  }

  const numero = Number(valor) || 0;
  return (
    <div className="col-span-2">
      <p className="text-[11px] uppercase tracking-wide text-zinc-400">Tu precio (mínimo {formatoPesos(minimo)})</p>
      <div className="mt-1 flex items-center gap-1.5">
        <div className="w-28">
          <CampoMonto value={valor} onChange={setValor} className="block w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm focus:border-zinc-500 focus:ring-zinc-500" />
        </div>
        <button
          type="button"
          disabled={guardando || numero < minimo}
          onClick={() => guardar(numero > minimo ? numero : null)}
          className="rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {guardando ? "…" : "Guardar"}
        </button>
        <button type="button" onClick={() => setEditando(false)} className="text-[11px] text-zinc-500 hover:text-zinc-900">
          cancelar
        </button>
      </div>
      {numero > 0 && numero < minimo && <p className="mt-1 text-[11px] text-red-600">No puede ser menor al mínimo autorizado.</p>}
      {numero > minimo && <p className="mt-1 text-[11px] text-emerald-700">Ganas {formatoPesos(numero - minimo)} extra por pieza.</p>}
      {actual && actual > minimo && (
        <button type="button" onClick={() => guardar(null)} className="mt-1 text-[11px] text-zinc-400 hover:text-zinc-900 hover:underline">
          regresar al mínimo
        </button>
      )}
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

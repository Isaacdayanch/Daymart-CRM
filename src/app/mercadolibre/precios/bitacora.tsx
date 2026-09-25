"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatoFechaHoraMx } from "@/lib/fechas-mx";
import { formatoPesos } from "@/lib/formato";
import type { CambioPrecio } from "@/lib/mercadolibre-precios";
import { deshacerPrecioMl } from "../actions";

const MODOS: Record<string, string> = { FIJO: "precio fijo", PORCENTAJE: "por %", MARGEN: "por margen" };

/** Últimos cambios de precio hechos desde el CRM, con "Deshacer". */
export function Bitacora({ cambios }: { cambios: CambioPrecio[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (cambios.length === 0) return null;
  return (
    <details className="group rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium text-zinc-700">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
        Cambios de precio hechos desde el CRM ({cambios.length})
      </summary>
      {error && <p className="px-5 text-xs text-red-600">{error}</p>}
      <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
        {cambios.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="truncate text-zinc-900">{c.titulo ?? c.item_id}</p>
              <p className="text-[11px] text-zinc-400">
                {formatoFechaHoraMx(c.creado_en)} · <span className="font-mono">{c.item_id}</span>
                {c.variation_id ? ` / ${c.variation_id}` : ""}
                {c.modo && ` · ${MODOS[c.modo] ?? c.modo}`}
                {c.margen_estimado_pct !== null && ` · margen est. ${c.margen_estimado_pct.toFixed(1)}%`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-zinc-700">
                {c.precio_anterior !== null ? formatoPesos(c.precio_anterior) : "—"} → <span className="font-semibold text-zinc-900">{formatoPesos(c.precio_nuevo)}</span>
              </p>
              {c.resultado !== "OK" ? (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] text-red-700" title={c.error ?? ""}>
                  falló
                </span>
              ) : c.deshecho_en ? (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500">deshecho</span>
              ) : c.precio_anterior ? (
                <button
                  type="button"
                  disabled={ocupado === c.id}
                  onClick={async () => {
                    if (!window.confirm(`¿Regresar “${c.titulo ?? c.item_id}” a ${formatoPesos(c.precio_anterior ?? 0)}?`)) return;
                    setOcupado(c.id);
                    setError(null);
                    const r = await deshacerPrecioMl(c.id);
                    setOcupado(null);
                    if (r.error) setError(r.error);
                    else router.refresh();
                  }}
                  className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline disabled:opacity-50"
                >
                  {ocupado === c.id ? "…" : "Deshacer"}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

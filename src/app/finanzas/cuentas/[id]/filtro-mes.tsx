"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import type { Periodo } from "@/lib/estado-cuenta";

/** Mes por mes con flechas (empieza en el mes actual), o "Elegir fechas"
 * para un rango libre. */
export function FiltroMes({ base, periodo, hoyTexto }: { base: string; periodo: Periodo; hoyTexto: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(periodo.mes === null);
  const [desdeSel, setDesdeSel] = useState(periodo.desde);
  const [hastaSel, setHastaSel] = useState(periodo.hasta);
  const puedeAvanzar = periodo.mesSiguiente <= hoyTexto.slice(0, 7);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center overflow-hidden rounded-lg border border-zinc-300 bg-white text-sm">
          <Link href={`${base}?mes=${periodo.mesAnterior}`} className="px-3 py-1.5 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900" title="Mes anterior">
            ‹
          </Link>
          <span className="min-w-[10rem] px-3 py-1.5 text-center font-medium text-zinc-900">{periodo.etiqueta}</span>
          {puedeAvanzar ? (
            <Link href={`${base}?mes=${periodo.mesSiguiente}`} className="px-3 py-1.5 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900" title="Mes siguiente">
              ›
            </Link>
          ) : (
            <span className="px-3 py-1.5 text-zinc-200">›</span>
          )}
        </div>
        <Link href={`${base}?mes=${hoyTexto.slice(0, 7)}`} className="text-xs text-zinc-500 hover:text-zinc-900">
          Este mes
        </Link>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className={`rounded-lg border px-3 py-1.5 text-xs ${periodo.mes === null ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-600 hover:text-zinc-900"}`}
        >
          Elegir fechas
        </button>
      </div>
      {abierto && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
          <div>
            <label className="block text-[11px] font-medium text-zinc-500">Desde</label>
            <div className="mt-1">
              <CampoFecha defaultValue={desdeSel} onChange={setDesdeSel} max={hoyTexto} />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-zinc-500">Hasta</label>
            <div className="mt-1">
              <CampoFecha defaultValue={hastaSel} onChange={setHastaSel} max={hoyTexto} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!desdeSel || !hastaSel) return;
              const [d, h] = desdeSel <= hastaSel ? [desdeSel, hastaSel] : [hastaSel, desdeSel];
              router.push(`${base}?desde=${d}&hasta=${h}`);
            }}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Ver
          </button>
        </div>
      )}
    </div>
  );
}

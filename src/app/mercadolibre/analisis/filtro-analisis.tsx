"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";

const RAPIDOS = [
  { valor: "7", etiqueta: "Últimos 7 días" },
  { valor: "30", etiqueta: "Últimos 30 días" },
  { valor: "90", etiqueta: "Últimos 90 días" },
];

export function FiltroAnalisis({ dias, desde, hasta }: { dias: string; desde: string; hasta: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(!dias);
  const [desdeSel, setDesdeSel] = useState(desde);
  const [hastaSel, setHastaSel] = useState(hasta);
  return (
    <div className="space-y-2">
      <div className="flex overflow-hidden rounded-lg border border-zinc-300 text-xs">
        {RAPIDOS.map((p) => (
          <Link key={p.valor} href={`/mercadolibre/analisis?dias=${p.valor}`} onClick={() => setAbierto(false)} className={`px-3 py-1.5 ${dias === p.valor ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:text-zinc-900"}`}>
            {p.etiqueta}
          </Link>
        ))}
        <button type="button" onClick={() => setAbierto((v) => !v)} className={`px-3 py-1.5 ${!dias ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:text-zinc-900"}`}>
          Elegir fechas
        </button>
      </div>
      {abierto && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
          <div>
            <label className="block text-[11px] font-medium text-zinc-500">Desde</label>
            <CampoFecha defaultValue={desdeSel} onChange={setDesdeSel} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-zinc-500">Hasta</label>
            <CampoFecha defaultValue={hastaSel} onChange={setHastaSel} />
          </div>
          <button
            type="button"
            disabled={!desdeSel || !hastaSel}
            onClick={() => router.push(`/mercadolibre/analisis?desde=${desdeSel}&hasta=${hastaSel}`)}
            className="rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            Ver
          </button>
        </div>
      )}
    </div>
  );
}

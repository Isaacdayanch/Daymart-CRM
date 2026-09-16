"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";

const RAPIDOS = [
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "semana", etiqueta: "Esta semana" },
  { valor: "mes", etiqueta: "Este mes" },
];

/** Filtro de fechas de las ventas: atajos (hoy / esta semana / este mes) o
 * un rango a la medida con el calendario propio del sistema. Todo en
 * fechas de Ciudad de México. */
export function FiltroFechas({
  periodo,
  desde,
  hasta,
  hoyTexto,
}: {
  periodo: string;
  desde: string;
  hasta: string;
  hoyTexto: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(periodo === "personalizado");
  const [desdeSel, setDesdeSel] = useState(desde);
  const [hastaSel, setHastaSel] = useState(hasta);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-zinc-300 text-xs">
          {RAPIDOS.map((p) => (
            <Link
              key={p.valor}
              href={`/mercadolibre?periodo=${p.valor}`}
              onClick={() => setAbierto(false)}
              className={`px-3 py-1.5 ${periodo === p.valor ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:text-zinc-900"}`}
            >
              {p.etiqueta}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className={`px-3 py-1.5 ${periodo === "personalizado" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:text-zinc-900"}`}
          >
            Elegir fechas
          </button>
        </div>
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
              router.push(`/mercadolibre?desde=${d}&hasta=${h}`);
            }}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Ver ventas
          </button>
        </div>
      )}
    </div>
  );
}

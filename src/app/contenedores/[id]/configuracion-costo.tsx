"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BaseCostoContenedor } from "@/lib/calculos";
import { formatoPesos as pesos } from "@/lib/formato";
import { reabrirConfiguracion, terminarConfiguracion } from "./actions";

/** Aviso del costo estimado mientras el contenedor se configura, con el botón
 * "Terminar de configurar" (Isaac, 18 oct: "al cargar un producto que me dé
 * una idea del costo, y al final un botón para que se reprorratee exacto").
 * Mientras configura: flete + aduana repartidos como si el contenedor fuera
 * lleno y tipo de cambio estimado si no hay abonos. Al terminar: se reparten
 * entre los m³ reales. Se puede "volver a configurar" mientras siga en
 * Configurándose. */
export function ConfiguracionCosto({ contenedorId, base, estadoConfigurandose, terminadaEn }: { contenedorId: string; base: BaseCostoContenedor; estadoConfigurandose: boolean; terminadaEn: string | null }) {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function correr(accion: () => Promise<{ error: string | null }>) {
    setTrabajando(true);
    setError(null);
    const r = await accion();
    setTrabajando(false);
    if (r.error) setError(r.error);
    else router.refresh();
  }

  if (base.enConfiguracion) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-900">Costo estimado mientras configuras el contenedor</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-amber-800">
              {base.motivos.map((m) => (
                <li key={m}>{m}</li>
              ))}
              {base.motivos.length === 0 && <li>ya llevas el contenedor lleno: el reparto es sobre los m³ reales.</li>}
            </ul>
            <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-xs text-amber-900">
              Números que se están usando: gastos capturados <strong>{pesos(base.costoPorCbm * base.cbmBase)}</strong> (flete + aduana + otros) entre <strong>{base.cbmBase.toFixed(2)} m³</strong> = <strong>{pesos(base.costoPorCbm)} por m³</strong> · tipo de cambio <strong>{base.tipoCambio > 0 ? base.tipoCambio.toFixed(2) : "0 (falta)"}</strong>. El costo de cada producto = su parte de esos gastos + su precio en dólares × ese tipo de cambio (ver el desglose debajo de cada costo).
            </p>
            <p className="mt-2 text-xs text-amber-800">
              Así cada producto que agregues te da una idea real de lo que te va a costar. Cuando termines de cargar productos, dale a <strong>Terminar de configurar</strong>: el flete y la aduana se reparten exacto entre lo que de verdad va en el contenedor.
            </p>
          </div>
          <button
            type="button"
            disabled={trabajando}
            onClick={() => correr(() => terminarConfiguracion(contenedorId))}
            className="shrink-0 rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-800 active:scale-[0.97] disabled:opacity-50"
          >
            {trabajando ? "Guardando…" : "Terminar de configurar →"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      </div>
    );
  }

  if (estadoConfigurandose && terminadaEn) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <p className="text-xs text-emerald-800">
          <strong>Configuración terminada:</strong> el costo por pieza ya es exacto, repartido entre los {base.cbmBase.toFixed(2)} m³ reales.
          {base.estimado && base.motivos.length > 0 && <> Ojo: {base.motivos.join("; ")}.</>}
        </p>
        <button type="button" disabled={trabajando} onClick={() => correr(() => reabrirConfiguracion(contenedorId))} className="text-xs text-emerald-800 underline-offset-2 hover:underline disabled:opacity-50">
          {trabajando ? "…" : "volver a configurar"}
        </button>
        {error && <p className="w-full text-xs text-red-700">{error}</p>}
      </div>
    );
  }

  // Ya salió de configuración (en tránsito o después): solo se avisa si algo
  // sigue siendo estimado (ej. sin abonos todavía).
  if (base.estimado && base.motivos.length > 0) {
    return <p className="text-xs text-amber-800">⚠ Costo todavía aproximado: {base.motivos.join("; ")}.</p>;
  }
  return null;
}

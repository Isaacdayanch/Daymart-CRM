"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BaseCostoContenedor } from "@/lib/calculos";
import { formatoPesos as pesos } from "@/lib/formato";
import { ESTADOS_CONTENEDOR, type EstadoContenedor } from "@/lib/tipos";
import { reabrirConfiguracion, terminarConfiguracion } from "./actions";

/** Aviso del costo estimado mientras el contenedor se configura, con el botón
 * "Terminar de configurar" (Isaac, 18 oct: "al cargar un producto que me dé
 * una idea del costo, y al final un botón para que se reprorratee exacto").
 * Mientras configura: flete + aduana repartidos como si el contenedor fuera
 * lleno y tipo de cambio estimado si no hay abonos. Al terminar: se reparten
 * entre los m³ reales. Se puede "volver a configurar" mientras siga en
 * Configurándose.
 *
 * Isaac (19 oct): "lo que quiero es un estimado real previo a terminar la
 * configuración" — su contenedor 16 repartía los gastos entre los 40 m³ que
 * llevaba (no entre 68) porque ya no estaba en modo configuración. Ahora,
 * cuando el reparto es sobre los m³ reales y el contenedor NO va lleno, se
 * explica por qué y cómo regresar al estimado "como si fuera lleno". */
export function ConfiguracionCosto({
  contenedorId,
  base,
  estado,
  terminadaEn,
}: {
  contenedorId: string;
  base: BaseCostoContenedor;
  estado: EstadoContenedor;
  terminadaEn: string | null;
}) {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const estadoConfigurandose = estado === "CONFIGURANDOSE";
  const etiquetaEstado = ESTADOS_CONTENEDOR.find((e) => e.valor === estado)?.etiqueta ?? estado;
  const vaLleno = base.cbmReal >= base.capacidadCbm;
  const costoPorCbmLleno = base.capacidadCbm > 0 ? base.gastos / base.capacidadCbm : 0;

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
              Números que se están usando: gastos capturados <strong>{pesos(base.gastos)}</strong> (flete + aduana + otros) entre <strong>{base.cbmBase.toFixed(2)} m³</strong> = <strong>{pesos(base.costoPorCbm)} por m³</strong> · tipo de cambio <strong>{base.tipoCambio > 0 ? base.tipoCambio.toFixed(2) : "0 (falta)"}</strong>. El costo de cada producto = su parte de esos gastos + su precio en dólares × ese tipo de cambio (ver el desglose debajo de cada costo).
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

  // Terminó de configurar (botón) pero sigue en Configurándose: se puede
  // reabrir. Si además el contenedor no va lleno, se le dice claro que los
  // gastos están cayendo solo sobre lo cargado.
  if (estadoConfigurandose && terminadaEn) {
    return (
      <div className={`rounded-xl border px-4 py-3 ${vaLleno ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={`text-xs ${vaLleno ? "text-emerald-800" : "text-amber-900"}`}>
            <strong>Configuración terminada:</strong> los gastos ({pesos(base.gastos)}) se reparten entre los <strong>{base.cbmReal.toFixed(2)} m³ reales</strong> = {pesos(base.costoPorCbm)} por m³.
            {base.estimado && base.motivos.length > 0 && <> Ojo: {base.motivos.join("; ")}.</>}
          </p>
          <button type="button" disabled={trabajando} onClick={() => correr(() => reabrirConfiguracion(contenedorId))} className={`text-xs underline-offset-2 hover:underline disabled:opacity-50 ${vaLleno ? "text-emerald-800" : "font-medium text-amber-900"}`}>
            {trabajando ? "…" : "volver a configurar"}
          </button>
        </div>
        {!vaLleno && (
          <p className="mt-1.5 text-xs text-amber-800">
            Llevas {base.cbmReal.toFixed(1)} de {base.capacidadCbm} m³. Si todavía vas a cargar más producto, dale <strong>volver a configurar</strong> y el costo se estima como si el contenedor fuera lleno: {pesos(costoPorCbmLleno)} por m³ en vez de {pesos(base.costoPorCbm)}.
          </p>
        )}
        {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      </div>
    );
  }

  // Ya salió de configuración (en tránsito o después). Si no va lleno, casi
  // seguro se cambió el estado antes de terminar de cargarlo: se explica
  // cómo regresar al estimado. Si va lleno, solo se avisa lo que siga
  // siendo aproximado (ej. sin abonos todavía).
  if (!vaLleno && estado !== "RECIBIDO_BODEGA") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <p>
          <strong>Los gastos se reparten entre los {base.cbmReal.toFixed(2)} m³ reales</strong> ({pesos(base.gastos)} ÷ {base.cbmReal.toFixed(2)} = {pesos(base.costoPorCbm)} por m³) porque el contenedor ya está en <strong>{etiquetaEstado}</strong>, y en ese estado se toma como cargado completo.
        </p>
        <p className="mt-1.5 text-amber-800">
          Llevas {base.cbmReal.toFixed(1)} de {base.capacidadCbm} m³. Si todavía lo estás cargando, regrésalo a <strong>Configurándose</strong> en la tarjeta de Estado (arriba): el costo se estima como si fuera lleno, {pesos(costoPorCbmLleno)} por m³, y ya terminando le das &ldquo;Terminar de configurar&rdquo;.
          {base.estimado && base.motivos.length > 0 && <> Además: {base.motivos.join("; ")}.</>}
        </p>
      </div>
    );
  }
  if (base.estimado && base.motivos.length > 0) {
    return <p className="text-xs text-amber-800">⚠ Costo todavía aproximado: {base.motivos.join("; ")}.</p>;
  }
  return null;
}

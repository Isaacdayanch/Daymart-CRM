"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { configurarSalidasMl, confirmarDevolucion, procesarAhora } from "./actions";

const btnSec = "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50";

export function InterruptorVentasMl({ desde, hoyTexto }: { desde: string | null; hoyTexto: string }) {
  const router = useRouter();
  const [fecha, setFecha] = useState(desde ?? hoyTexto);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function guardar(apagar: boolean) {
    setEnviando(true);
    setError(null);
    const fd = new FormData();
    fd.set("desde", fecha);
    if (apagar) fd.set("apagar", "true");
    const r = await configurarSalidasMl(fd);
    setEnviando(false);
    if (r?.error) setError(r.error);
    else router.refresh();
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-[11px] font-medium text-zinc-500">Desde qué fecha</label>
        <div className="mt-1">
          <CampoFecha defaultValue={fecha} onChange={setFecha} max={hoyTexto} />
        </div>
      </div>
      {desde ? (
        <>
          <button type="button" disabled={enviando} onClick={() => guardar(false)} className={btnSec}>
            Cambiar fecha
          </button>
          <button type="button" disabled={enviando} onClick={() => guardar(true)} className="text-xs text-zinc-400 hover:text-red-600">
            Apagar
          </button>
        </>
      ) : (
        <button type="button" disabled={enviando} onClick={() => guardar(false)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          Activar salidas automáticas
        </button>
      )}
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function BotonProcesarAhora() {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={cargando}
        onClick={async () => {
          setCargando(true);
          const r = await procesarAhora();
          setCargando(false);
          setMensaje(r.error ? `Error: ${r.error}` : `Listo: ${r.generadas} venta(s) con salida nueva.`);
          router.refresh();
        }}
        className={btnSec}
      >
        {cargando ? "Revisando…" : "Revisar ahora"}
      </button>
      {mensaje && <span className={`text-xs ${mensaje.startsWith("Error") ? "text-red-600" : "text-emerald-700"}`}>{mensaje}</span>}
    </div>
  );
}

export function BotonesDevolucion({ ordenId }: { ordenId: number }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function decidir(decision: "REINGRESADA" | "MERMA") {
    setEnviando(true);
    const r = await confirmarDevolucion(ordenId, decision);
    setEnviando(false);
    if (r?.error) setError(r.error);
    else router.refresh();
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={enviando} onClick={() => decidir("REINGRESADA")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
        Regresó a bodega
      </button>
      <button type="button" disabled={enviando} onClick={() => decidir("MERMA")} className={btnSec}>
        No regresó / dañada
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

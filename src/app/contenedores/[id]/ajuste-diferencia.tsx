"use client";

import { useState } from "react";
import { CampoMonto } from "@/components/campo-monto";
import { formatoPesos } from "@/lib/formato";
import { actualizarAjusteDiferencia, calcularPendienteChinaPagado } from "./actions";

const NOTA_DEFAULT = "Gastos extraordinarios — fletes internos China, ajustes de proveedor";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export function AjusteDiferencia({
  contenedorId,
  diferenciaBruta,
  ajusteActual,
  notaActual,
}: {
  contenedorId: string;
  diferenciaBruta: number;
  ajusteActual: number;
  notaActual: string | null;
}) {
  const [editando, setEditando] = useState(false);
  const [montoSugerido, setMontoSugerido] = useState<number | null>(null);
  const [notaSugerida, setNotaSugerida] = useState<string | null>(null);
  const [buscandoPendiente, setBuscandoPendiente] = useState(false);
  const [errorPendiente, setErrorPendiente] = useState<string | null>(null);
  const guardar = actualizarAjusteDiferencia.bind(null, contenedorId);

  async function alExplicarConPendienteChina() {
    setBuscandoPendiente(true);
    setErrorPendiente(null);
    const resultado = await calcularPendienteChinaPagado(contenedorId);
    setBuscandoPendiente(false);
    if (resultado.error || resultado.valor === undefined) {
      setErrorPendiente(resultado.error ?? "No se pudo calcular.");
      return;
    }
    setMontoSugerido(Math.round(resultado.valor));
    setNotaSugerida(resultado.detalle ?? null);
    setEditando(true);
  }

  if (!editando) {
    if (ajusteActual !== 0) {
      return (
        <p className="mt-2 text-xs text-zinc-500">
          Diferencia explicada: <span className="font-medium text-zinc-700">{formatoPesos(ajusteActual)}</span>
          {notaActual ? ` — ${notaActual}` : ""}{" "}
          <button type="button" onClick={() => setEditando(true)} className="text-zinc-400 underline hover:text-zinc-900">
            editar
          </button>
        </p>
      );
    }
    if (Math.abs(diferenciaBruta) < 1) return null;
    return (
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="text-xs font-medium text-zinc-500 underline hover:text-zinc-900"
        >
          + Explicar esta diferencia
        </button>
        <button
          type="button"
          onClick={alExplicarConPendienteChina}
          disabled={buscandoPendiente}
          className="text-xs font-medium text-zinc-500 underline hover:text-zinc-900 disabled:opacity-50"
        >
          {buscandoPendiente ? "Buscando..." : "Fue mercancía pagada en China →"}
        </button>
        {errorPendiente && <p className="w-full text-xs text-red-600">{errorPendiente}</p>}
      </div>
    );
  }

  return (
    <form
      action={async (formData) => {
        await guardar(formData);
        setEditando(false);
        setMontoSugerido(null);
        setNotaSugerida(null);
      }}
      className="mt-3 grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-[160px_1fr_auto_auto] sm:items-end"
    >
      {notaSugerida && (
        <p className="text-xs text-zinc-500 sm:col-span-4">
          Encontrado en Pendientes de China — revisa y dale &ldquo;Guardar&rdquo; para confirmarlo.
        </p>
      )}
      <div>
        <label className="block text-xs font-medium text-zinc-500">Monto (pesos)</label>
        <CampoMonto
          key={montoSugerido ?? "manual"}
          name="ajuste_diferencia_pesos"
          defaultValue={montoSugerido ?? (ajusteActual !== 0 ? ajusteActual : Math.round(diferenciaBruta))}
          className={claseCampo}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500">¿Qué fue?</label>
        <input
          key={notaSugerida ?? "manual-nota"}
          type="text"
          name="ajuste_diferencia_nota"
          defaultValue={notaSugerida ?? notaActual ?? NOTA_DEFAULT}
          className={claseCampo}
        />
      </div>
      <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
        Guardar
      </button>
      <button
        type="button"
        onClick={() => {
          setEditando(false);
          setMontoSugerido(null);
          setNotaSugerida(null);
        }}
        className="text-xs font-medium text-zinc-400 hover:text-zinc-700"
      >
        Cancelar
      </button>
    </form>
  );
}

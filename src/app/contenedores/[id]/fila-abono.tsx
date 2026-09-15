"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoMonto } from "@/components/campo-monto";
import { CampoNumero } from "@/components/campo-numero";
import { Selector } from "@/components/selector";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import type { PagoMercancia } from "@/lib/tipos";
import { actualizarAbono, eliminarAbono } from "./actions";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export function FilaAbono({ contenedorId, abono }: { contenedorId: string; abono: PagoMercancia }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const hoyTexto = new Date().toISOString().slice(0, 10);

  if (editando) {
    return (
      <li className="py-3">
        <form
          action={async (formData) => {
            setEnviando(true);
            setError(null);
            const resultado = await actualizarAbono(contenedorId, abono.id, formData);
            setEnviando(false);
            if (resultado?.error) setError(resultado.error);
            else {
              setEditando(false);
              router.refresh();
            }
          }}
          className="grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-end"
        >
          <div>
            <label className="block text-xs font-medium text-zinc-500">Monto USD</label>
            <CampoMonto name="monto_dolares" defaultValue={abono.monto_dolares} required className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">
              Tipo de cambio{!abono.pagado && " (estimado)"}
            </label>
            <CampoNumero name="tipo_cambio" defaultValue={abono.tipo_cambio} required className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Fecha</label>
            <CampoFecha name="fecha" defaultValue={(abono.fecha ?? abono.creado_en).slice(0, 10)} max={hoyTexto} />
          </div>
          {abono.pagado ? (
            <div />
          ) : abono.cargo_deuda_id ? (
            <div>
              <label className="block text-xs font-medium text-zinc-500">Vence</label>
              <CampoFecha name="fecha_limite" defaultValue={abono.fecha_limite?.slice(0, 10)} />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-zinc-500">Estado</label>
              <div className="mt-1">
                <Selector
                  name="pagado"
                  defaultValue={abono.pagado ? "true" : "false"}
                  opciones={[
                    { value: "true", label: "Pagado" },
                    { value: "false", label: "Pendiente" },
                  ]}
                />
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={enviando}
              className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {enviando ? "..." : "Guardar"}
            </button>
            <button type="button" onClick={() => setEditando(false)} className="text-xs text-zinc-400 hover:text-zinc-700">
              Cancelar
            </button>
          </div>
          {abono.cargo_deuda_id && !abono.pagado && (
            <p className="text-[11px] text-zinc-400 sm:col-span-5">
              Este abono es crédito del proveedor: se marca pagado desde Finanzas → Proveedores → &ldquo;Enviar
              desde una cuenta puente&rdquo; (elige este contenedor y este abono), para que el dinero y la deuda
              queden en un solo registro.
            </p>
          )}
          {error && <p className="text-xs text-red-600 sm:col-span-5">{error}</p>}
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <span>
        ${abono.monto_dolares.toLocaleString("es-MX")} USD × {abono.tipo_cambio}
        {!abono.pagado && <span className="text-zinc-400"> (est.)</span>} ={" "}
        {formatoPesos(abono.monto_dolares * abono.tipo_cambio)}
      </span>
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-400">{formatoFecha(abono.fecha ?? abono.creado_en)}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            abono.pagado ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {abono.pagado ? "Pagado" : "Pendiente"}
        </span>
        {!abono.pagado && abono.fecha_limite && (
          <span className="text-xs font-medium text-amber-700">vence {formatoFecha(abono.fecha_limite)}</span>
        )}
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-zinc-400 underline hover:text-zinc-900">
          editar
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm("¿Quitar este abono?")) eliminarAbono(contenedorId, abono.id);
          }}
          className="text-zinc-400 hover:text-red-600"
          aria-label="Quitar abono"
        >
          ✕
        </button>
      </div>
    </li>
  );
}

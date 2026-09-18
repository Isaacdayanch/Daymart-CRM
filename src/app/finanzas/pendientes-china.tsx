"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoMonto } from "@/components/campo-monto";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import type { EnvioChina, MovimientoFinanciero } from "@/lib/tipos";
import { cancelarEnvioChina, completarComisionMovimiento, completarEnvioChina } from "./actions";

/** Aviso ámbar: transacciones a las que les falta la comisión — envíos a
 * China (al completarlos se hace el abono al proveedor y al contenedor) y
 * movimientos sueltos marcados "la sé después". */
export function PendientesChina({
  envios,
  movimientos = [],
  nombresCuentas,
}: {
  envios: EnvioChina[];
  movimientos?: MovimientoFinanciero[];
  nombresCuentas: Record<string, string>;
}) {
  const total = envios.length + movimientos.length;
  if (!total) return null;
  return (
    <div id="pendientes-china" className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
      <p className="text-sm font-semibold text-amber-900">Falta registrar la comisión de {total === 1 ? "1 transacción" : `${total} transacciones`}</p>
      <p className="text-xs text-amber-800">Cuando tengas el recibo, pon aquí la comisión y el sistema la separa sola (y en los envíos a China, completa el abono al proveedor y al contenedor).</p>
      <ul className="mt-3 divide-y divide-amber-200">
        {envios.map((e) => (
          <FilaPendiente key={e.id} envio={e} nombresCuentas={nombresCuentas} />
        ))}
        {movimientos.map((m) => (
          <FilaMovimientoPendiente key={m.id} movimiento={m} nombresCuentas={nombresCuentas} />
        ))}
      </ul>
    </div>
  );
}

function FilaMovimientoPendiente({ movimiento: m, nombresCuentas }: { movimiento: MovimientoFinanciero; nombresCuentas: Record<string, string> }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<"PORCENTAJE" | "MONTO" | "NETO">("PORCENTAJE");
  const [valor, setValor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const v = Number(valor) || 0;
  const comision = modo === "PORCENTAJE" ? Math.round(m.monto * v) / 100 : modo === "MONTO" ? v : m.monto - v;
  return (
    <li className="py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-zinc-900">
            {m.tipo === "TRANSFERENCIA" ? "Transferencia" : "Salida"} de <strong>{formatoPesos(m.monto)}</strong> · {formatoFecha(m.fecha)}
            {m.contraparte ? ` · ${m.contraparte}` : ""}
          </p>
          <p className="text-xs text-zinc-500">
            {nombresCuentas[m.cuenta_id] ?? "cuenta"}
            {m.cuenta_destino_id ? ` → ${nombresCuentas[m.cuenta_destino_id] ?? "cuenta"}` : ""}
            {m.notas ? ` · ${m.notas}` : ""}
          </p>
        </div>
        {!abierto && (
          <button type="button" onClick={() => setAbierto(true)} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700">
            Registrar comisión
          </button>
        )}
      </div>
      {abierto && (
        <form
          action={async (formData) => {
            setEnviando(true);
            setError(null);
            const r = await completarComisionMovimiento(m.id, formData);
            setEnviando(false);
            if (r?.error) setError(r.error);
            else router.refresh();
          }}
          className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-amber-200 bg-white p-3"
        >
          <input type="hidden" name="comision_modo" value={modo} />
          <div className="flex gap-1">
            <div className="flex overflow-hidden rounded-lg border border-zinc-300 text-xs">
              {(
                [
                  ["PORCENTAJE", "%"],
                  ["MONTO", "$"],
                  ["NETO", "Neto"],
                ] as const
              ).map(([mm, t]) => (
                <button key={mm} type="button" onClick={() => setModo(mm)} className={`px-2.5 py-1.5 ${modo === mm ? "bg-zinc-900 text-white" : "bg-white text-zinc-600"}`}>
                  {t}
                </button>
              ))}
            </div>
            {modo === "PORCENTAJE" ? (
              <input type="number" step="0.01" min={0} name="comision_valor" value={valor} onChange={(ev) => setValor(ev.target.value)} placeholder="1.75" className="w-24 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm" />
            ) : (
              <CampoMonto name="comision_valor" value={valor} onChange={setValor} className="block w-36 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm" />
            )}
          </div>
          <button type="submit" disabled={enviando} className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50">
            {enviando ? "Guardando…" : "Guardar comisión"}
          </button>
          <button type="button" onClick={() => setAbierto(false)} className="text-xs text-zinc-400 hover:text-zinc-700">
            Cancelar
          </button>
          {valor && comision >= 0 && comision < m.monto && (
            <p className="w-full text-[11px] text-zinc-500">
              Comisión {formatoPesos(comision)}: el movimiento queda en {formatoPesos(m.monto - comision)} y la comisión se guarda aparte en “Comisiones”.
            </p>
          )}
          {error && <p className="w-full text-xs text-red-600">{error}</p>}
        </form>
      )}
    </li>
  );
}

function FilaPendiente({ envio: e, nombresCuentas }: { envio: EnvioChina; nombresCuentas: Record<string, string> }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<"PORCENTAJE" | "MONTO" | "NETO">("PORCENTAJE");
  const [valor, setValor] = useState("");
  const [dolares, setDolares] = useState(e.monto_dolares ? String(e.monto_dolares) : "");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const hoyTexto = new Date().toISOString().slice(0, 10);
  const v = Number(valor) || 0;
  const comision = modo === "PORCENTAJE" ? Math.round(e.monto_pesos * v) / 100 : modo === "MONTO" ? v : e.monto_pesos - v;

  return (
    <li className="py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-zinc-900">
            <strong>{formatoPesos(e.monto_pesos)}</strong> para <strong>{e.proveedor}</strong> · {formatoFecha(e.fecha)}
          </p>
          <p className="text-xs text-zinc-500">
            {e.cuenta_origen_id ? nombresCuentas[e.cuenta_origen_id] ?? "cuenta" : "—"}
            {e.cuenta_puente_id ? ` → ${nombresCuentas[e.cuenta_puente_id] ?? "cuenta puente"}` : " (directo)"}
            {e.notas ? ` · ${e.notas}` : ""}
          </p>
        </div>
        {!abierto && (
          <button type="button" onClick={() => setAbierto(true)} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700">
            Registrar comisión
          </button>
        )}
      </div>
      {abierto && (
        <form
          action={async (formData) => {
            setEnviando(true);
            setError(null);
            const r = await completarEnvioChina(e.id, formData);
            setEnviando(false);
            if (r?.error) setError(r.error);
            else router.refresh();
          }}
          className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-amber-200 bg-white p-3"
        >
          <input type="hidden" name="comision_modo" value={modo} />
          <div>
            <label className="block text-[11px] font-medium text-zinc-500">Comisión</label>
            <div className="mt-1 flex gap-1">
              <div className="flex overflow-hidden rounded-lg border border-zinc-300 text-xs">
                {(
                  [
                    ["PORCENTAJE", "%"],
                    ["MONTO", "$"],
                    ["NETO", "Neto"],
                  ] as const
                ).map(([m, t]) => (
                  <button key={m} type="button" onClick={() => setModo(m)} className={`px-2.5 py-1.5 ${modo === m ? "bg-zinc-900 text-white" : "bg-white text-zinc-600"}`}>
                    {t}
                  </button>
                ))}
              </div>
              {modo === "PORCENTAJE" ? (
                <input type="number" step="0.01" min={0} name="comision_valor" value={valor} onChange={(ev) => setValor(ev.target.value)} placeholder="1.75" className="w-24 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm" />
              ) : (
                <CampoMonto name="comision_valor" value={valor} onChange={setValor} className="block w-36 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm" />
              )}
            </div>
          </div>
          {(e.moneda_proveedor === "USD" || e.contenedor_id) && (
            <div>
              <label className="block text-[11px] font-medium text-zinc-500">Dólares que le llegaron</label>
              <CampoMonto name="monto_dolares" value={dolares} onChange={setDolares} className="mt-1 block w-36 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm" />
            </div>
          )}
          <div>
            <label className="block text-[11px] font-medium text-zinc-500">Fecha del envío</label>
            <div className="mt-1">
              <CampoFecha name="fecha" defaultValue={e.fecha.slice(0, 10)} max={hoyTexto} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={enviando} className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50">
              {enviando ? "Guardando…" : "Completar envío"}
            </button>
            <button type="button" onClick={() => setAbierto(false)} className="text-xs text-zinc-400 hover:text-zinc-700">
              Cancelar
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!confirm("¿Cancelar este envío? Se borra la transferencia a la cuenta puente.")) return;
                const r = await cancelarEnvioChina(e.id);
                if (r?.error) alert(r.error);
                else router.refresh();
              }}
              className="text-xs text-zinc-400 hover:text-red-600"
            >
              anular envío
            </button>
          </div>
          {valor && comision >= 0 && comision < e.monto_pesos && (
            <p className="w-full text-[11px] text-zinc-500">
              Comisión {formatoPesos(comision)} → al proveedor llegan {formatoPesos(e.monto_pesos - comision)}; la comisión se absorbe al costo de la mercancía.
            </p>
          )}
          {error && <p className="w-full text-xs text-red-600">{error}</p>}
        </form>
      )}
    </li>
  );
}

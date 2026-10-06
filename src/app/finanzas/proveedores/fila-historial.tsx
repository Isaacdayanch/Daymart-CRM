"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoMonto } from "@/components/campo-monto";
import { Selector } from "@/components/selector";
import { formatoDolares, formatoFecha, formatoPesos } from "@/lib/formato";
import { fechaTextoMx } from "@/lib/fechas-mx";
import type { CuentaFinanciera, MovimientoDeudaProveedor } from "@/lib/tipos";
import { actualizarMovimientoDeudaProveedor, eliminarMovimientoDeudaProveedor } from "../actions";

const claseCampo = "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

/** Renglón del historial de deuda con proveedores, con editar/quitar para
 * los capturados a mano. Los que vienen de un contenedor (`ligado`) se
 * corrigen desde el contenedor. */
export function FilaHistorial({ m, cuentas, ligado }: { m: MovimientoDeudaProveedor; cuentas: CuentaFinanciera[]; ligado: boolean }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const monto = m.moneda === "USD" ? formatoDolares(m.monto) : formatoPesos(m.monto);
  const cuenta = m.cuenta_id ? cuentas.find((c) => c.id === m.cuenta_id)?.nombre : null;

  if (editando) {
    return (
      <div className="bg-zinc-50 px-6 py-4">
        <form
          action={async (fd) => {
            setError(null);
            const r = await actualizarMovimientoDeudaProveedor(m.id, fd);
            if (r.error) setError(r.error);
            else {
              setEditando(false);
              router.refresh();
            }
          }}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <p className="text-sm font-medium text-zinc-900 sm:col-span-2 lg:col-span-4">
            {m.proveedor} · {m.tipo === "CARGO" ? "Cargo" : "Abono"} ({m.moneda})
          </p>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Monto</label>
            <CampoMonto name="monto" defaultValue={m.monto} required className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Fecha</label>
            <div className="mt-1">
              <CampoFecha name="fecha" defaultValue={fechaTextoMx(new Date(m.fecha))} />
            </div>
          </div>
          {m.tipo === "CARGO" ? (
            <div>
              <label className="block text-xs font-medium text-zinc-500">Fecha límite (opcional)</label>
              <div className="mt-1">
                <CampoFecha name="fecha_limite" defaultValue={m.fecha_limite ? fechaTextoMx(new Date(m.fecha_limite)) : ""} />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-zinc-500">Cuenta de la que salió</label>
              <div className="mt-1">
                <Selector
                  name="cuenta_id"
                  defaultValue={m.cuenta_id ?? ""}
                  opciones={[...cuentas.map((c) => ({ value: c.id, label: c.nombre })), { value: "", label: "Sin cuenta (fue antes de usar el sistema)" }]}
                />
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-zinc-500">Notas</label>
            <input name="notas" defaultValue={m.notas ?? ""} className={claseCampo} />
          </div>
          <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
            <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
              Guardar
            </button>
            <button type="button" onClick={() => setEditando(false)} className="text-xs text-zinc-500 hover:text-zinc-900">
              Cancelar
            </button>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 px-6 py-3 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-zinc-900">
          {m.proveedor} · {m.tipo === "CARGO" ? "Cargo" : "Abono"}
        </p>
        <p className="text-xs text-zinc-500">
          {formatoFecha(m.fecha)}
          {m.notas ? ` — ${m.notas}` : ""}
          {m.tipo === "CARGO" && m.fecha_limite ? ` · vence ${formatoFecha(m.fecha_limite)}` : ""}
          {m.tipo === "ABONO" ? ` · ${cuenta ?? "sin cuenta"}` : ""}
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className={`font-semibold ${m.tipo === "CARGO" ? "text-red-600" : "text-emerald-600"}`}>
          {m.tipo === "CARGO" ? "+" : "-"}
          {monto}
        </p>
        {ligado ? (
          <p className="text-[11px] text-zinc-400">viene de un contenedor, se corrige desde ahí</p>
        ) : (
          <p className="text-[11px] text-zinc-400">
            <button type="button" onClick={() => setEditando(true)} className="hover:text-zinc-900 hover:underline">
              editar
            </button>
            {" · "}
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`¿Quitar este ${m.tipo === "CARGO" ? "cargo" : "abono"} de ${monto} a ${m.proveedor}?${m.movimiento_financiero_id ? " También se quita su movimiento de Finanzas." : ""}`)) return;
                setError(null);
                const r = await eliminarMovimientoDeudaProveedor(m.id);
                if (r.error) setError(r.error);
                else router.refresh();
              }}
              className="hover:text-red-600 hover:underline"
            >
              quitar
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Selector } from "@/components/selector";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoMonto } from "@/components/campo-monto";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import type { CobroVenta, CuentaFinanciera, FormaPagoVenta } from "@/lib/tipos";
import { actualizarCobro, eliminarCobro, registrarCobro } from "../actions";

function aTextoFecha(iso: string) {
  return iso.slice(0, 10);
}

export function Cobros({
  ventaId,
  cobros,
  cuentas,
  saldo,
  formaPago,
}: {
  ventaId: string;
  cobros: CobroVenta[];
  cuentas: CuentaFinanciera[];
  saldo: number;
  formaPago: FormaPagoVenta;
}) {
  const router = useRouter();
  const hoyTexto = new Date().toISOString().slice(0, 10);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const nombreCuenta = (id: string) => cuentas.find((c) => c.id === id)?.nombre ?? "Cuenta";

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 px-6 py-4">
        <h3 className="text-sm font-semibold text-zinc-900">Cobros</h3>
        <p className="text-xs text-zinc-500">
          Cada cobro entra como dinero real a la cuenta que elijas en Finanzas. Si corriges o quitas uno, se corrige
          allá también.
        </p>
      </div>

      {cobros.length === 0 ? (
        <p className="px-6 py-4 text-sm text-zinc-400">Todavía no hay cobros de esta venta.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {cobros.map((c) => (
            <FilaCobro key={c.id} cobro={c} cuentas={cuentas} nombreCuenta={nombreCuenta(c.cuenta_id)} hoyTexto={hoyTexto} />
          ))}
        </ul>
      )}

      {saldo > 0.01 && (
        <form
          className="border-t border-zinc-100 p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setGuardando(true);
            setError(null);
            const r = await registrarCobro(ventaId, new FormData(e.currentTarget));
            setGuardando(false);
            if (r.error) {
              setError(r.error);
              return;
            }
            router.refresh();
          }}
        >
          <p className="text-xs font-medium text-zinc-500">
            Registrar un cobro {formaPago === "CREDITO" ? "(puede ser parcial)" : ""} — faltan {formatoPesos(saldo)}
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500">Monto</label>
              <div className="mt-1">
                <CampoMonto name="monto" defaultValue={Math.round(saldo * 100) / 100} required />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">A qué cuenta entra</label>
              <div className="mt-1">
                <Selector name="cuenta_id" defaultValue={cuentas[0]?.id} opciones={cuentas.map((c) => ({ value: c.id, label: c.nombre }))} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Fecha</label>
              <div className="mt-1">
                <CampoFecha name="fecha" defaultValue={hoyTexto} max={hoyTexto} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Notas (opcional)</label>
              <input
                type="text"
                name="notas"
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
              />
            </div>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Registrar cobro"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function FilaCobro({
  cobro,
  cuentas,
  nombreCuenta,
  hoyTexto,
}: {
  cobro: CobroVenta;
  cuentas: CuentaFinanciera[];
  nombreCuenta: string;
  hoyTexto: string;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  if (editando) {
    return (
      <li className="px-6 py-4">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setGuardando(true);
            setError(null);
            const r = await actualizarCobro(cobro.id, new FormData(e.currentTarget));
            setGuardando(false);
            if (r.error) {
              setError(r.error);
              return;
            }
            setEditando(false);
            router.refresh();
          }}
          className="grid gap-3 sm:grid-cols-4"
        >
          <div>
            <label className="block text-xs font-medium text-zinc-500">Monto</label>
            <div className="mt-1">
              <CampoMonto name="monto" defaultValue={cobro.monto} required />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Cuenta</label>
            <div className="mt-1">
              <Selector name="cuenta_id" defaultValue={cobro.cuenta_id} opciones={cuentas.map((c) => ({ value: c.id, label: c.nombre }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Fecha</label>
            <div className="mt-1">
              <CampoFecha name="fecha" defaultValue={aTextoFecha(cobro.fecha)} max={hoyTexto} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Notas</label>
            <input
              type="text"
              name="notas"
              defaultValue={cobro.notas ?? ""}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
            />
          </div>
          {error && <p className="text-sm text-red-600 sm:col-span-4">{error}</p>}
          <div className="flex items-center gap-3 sm:col-span-4">
            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Guardar"}
            </button>
            <button type="button" onClick={() => setEditando(false)} className="text-xs text-zinc-500 hover:text-zinc-900">
              Cancelar
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 px-6 py-3">
      <div>
        <p className="text-sm font-medium text-zinc-900">{formatoPesos(cobro.monto)}</p>
        <p className="text-xs text-zinc-400">
          {formatoFecha(cobro.fecha)} · {nombreCuenta}
          {cobro.notas ? ` · ${cobro.notas}` : ""}
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      <div className="flex items-center gap-3 text-xs">
        <button type="button" onClick={() => setEditando(true)} className="text-zinc-500 hover:text-zinc-900">
          editar
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!window.confirm("¿Quitar este cobro? También se quita su entrada en Finanzas.")) return;
            const r = await eliminarCobro(cobro.id);
            if (r.error) {
              setError(r.error);
              return;
            }
            router.refresh();
          }}
          className="text-zinc-400 hover:text-red-600"
        >
          quitar
        </button>
      </div>
    </li>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatoDolares, formatoPesos } from "@/lib/formato";
import type { RenglonEstadoCuenta } from "@/lib/estado-cuenta";
import type { CategoriaFinanciera, CuentaFinanciera, Moneda } from "@/lib/tipos";
import { eliminarMovimiento } from "../../actions";
import { FormularioEditarMovimiento } from "../../movimientos/formulario-editar-movimiento";

/** Un renglón del estado de cuenta: fecha, concepto, entrada, salida y
 * saldo corrido — con "editar" y "quitar" si el movimiento es suelto. Los
 * que vienen de otra pantalla salen con una notita de dónde vienen. */
export function FilaEstadoCuenta({
  renglon: r,
  moneda,
  cuentas,
  categorias,
  origenLigado,
}: {
  renglon: RenglonEstadoCuenta;
  moneda: Moneda;
  cuentas: CuentaFinanciera[];
  categorias: CategoriaFinanciera[];
  origenLigado: string | null;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const dinero = (v: number) => (moneda === "USD" ? formatoDolares(v) : formatoPesos(v));
  const m = r.movimiento;

  if (editando) {
    return (
      <tr className="bg-zinc-50">
        <td colSpan={6} className="p-4">
          <FormularioEditarMovimiento movimiento={m} cuentas={cuentas} categorias={categorias} esAjuste={r.esAjuste} alTerminar={() => setEditando(false)} />
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-zinc-500">{r.fecha.split("-").reverse().join("/")}</td>
      <td className="px-4 py-2.5">
        <p className="text-sm text-zinc-900">
          {r.concepto}
          {r.esAjuste && <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">ajuste</span>}
          {r.esTransferencia && <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">transferencia</span>}
          {m.comision_pendiente && (
            <a href="/finanzas#pendientes-china" className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20 hover:bg-amber-200">
              falta comisión
            </a>
          )}
        </p>
        {r.detalle && <p className="text-xs text-zinc-400">{r.detalle}</p>}
        {origenLigado && <p className="text-[11px] text-zinc-400">viene de {origenLigado} — se corrige desde ahí</p>}
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 text-right text-emerald-700">{r.entrada > 0 ? dinero(r.entrada) : ""}</td>
      <td className="whitespace-nowrap px-4 py-2.5 text-right text-red-600">{r.salida > 0 ? dinero(r.salida) : ""}</td>
      <td className={`whitespace-nowrap px-4 py-2.5 text-right font-medium ${r.saldo < 0 ? "text-red-600" : "text-zinc-900"}`}>{dinero(r.saldo)}</td>
      <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs">
        {origenLigado ? (
          <span className="text-zinc-300">—</span>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setEditando(true)} className="text-zinc-400 underline hover:text-zinc-900">
              editar
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!confirm("¿Quitar este movimiento? No se puede deshacer.")) return;
                const resultado = await eliminarMovimiento(m.id);
                if (resultado?.error) alert(resultado.error);
                else router.refresh();
              }}
              className="text-zinc-400 underline hover:text-red-600"
            >
              quitar
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

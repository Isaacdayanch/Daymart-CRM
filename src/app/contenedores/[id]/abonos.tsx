"use client";

import { CampoNumero } from "@/components/campo-numero";
import { formatoPesos } from "@/lib/formato";
import { tipoCambioPromedioMercancia } from "@/lib/calculos";
import type { PagoMercancia } from "@/lib/tipos";
import { agregarAbono, eliminarAbono } from "./actions";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export function Abonos({ contenedorId, abonos }: { contenedorId: string; abonos: PagoMercancia[] }) {
  const agregar = agregarAbono.bind(null, contenedorId);
  const tipoCambioPromedio = tipoCambioPromedioMercancia(abonos);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-zinc-700">Abonos de mercancía</p>
        {tipoCambioPromedio > 0 && (
          <p className="text-xs text-zinc-500">
            Tipo de cambio promedio: <span className="font-medium text-zinc-700">{tipoCambioPromedio.toFixed(3)}</span>
          </p>
        )}
      </div>

      {abonos.length > 0 && (
        <ul className="mt-3 divide-y divide-zinc-100">
          {abonos.map((abono) => (
            <li key={abono.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                ${abono.monto_dolares.toLocaleString("es-MX")} USD × {abono.tipo_cambio} ={" "}
                {formatoPesos(abono.monto_dolares * abono.tipo_cambio)}
              </span>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    abono.pagado ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {abono.pagado ? "Pagado" : "Pendiente"}
                </span>
                <button
                  type="button"
                  onClick={() => eliminarAbono(contenedorId, abono.id)}
                  className="text-zinc-400 hover:text-red-600"
                  aria-label="Quitar abono"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        action={agregar}
        className="mt-4 grid grid-cols-[1fr_1fr_auto_auto] items-end gap-2 border-t border-zinc-100 pt-4"
      >
        <div>
          <label className="block text-xs font-medium text-zinc-500">Monto USD</label>
          <CampoNumero name="monto_dolares" className={claseCampo} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Tipo de cambio</label>
          <CampoNumero name="tipo_cambio" className={claseCampo} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Estado</label>
          <select name="pagado" defaultValue="true" className={claseCampo}>
            <option value="true">Pagado</option>
            <option value="false">Pendiente</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          + Agregar
        </button>
      </form>
    </div>
  );
}

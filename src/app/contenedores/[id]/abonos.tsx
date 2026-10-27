"use client";

import { CampoNumero } from "@/components/campo-numero";
import { CampoMonto } from "@/components/campo-monto";
import { CampoFecha } from "@/components/campo-fecha";
import { Selector } from "@/components/selector";
import { tipoCambioPromedioMercancia, totalesMercancia } from "@/lib/calculos";
import { abonosExcedenMercancia } from "@/lib/planeador";
import Link from "next/link";
import type { PagoMercancia } from "@/lib/tipos";
import { agregarAbono } from "./actions";
import { FilaAbono } from "./fila-abono";

import { BotonGuardar } from "@/components/boton-guardar";
const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export function Abonos({ contenedorId, abonos, totalUsdMercancia }: { contenedorId: string; abonos: PagoMercancia[]; totalUsdMercancia?: number }) {
  const agregar = agregarAbono.bind(null, contenedorId);
  const tipoCambioPromedio = tipoCambioPromedioMercancia(abonos);
  const hoyTexto = new Date().toISOString().slice(0, 10);
  const { totalDolares: abonadoUsd } = totalesMercancia(abonos);
  // Los abonos se quedan en el contenedor aunque la mercancía se mueva desde
  // el planeador: si ya se abonó más de lo que vale lo que queda, se avisa.
  const abonosDeMas = typeof totalUsdMercancia === "number" && abonosExcedenMercancia(totalUsdMercancia, abonadoUsd);

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

      {abonosDeMas && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Los abonos suman <span className="font-semibold">${abonadoUsd.toLocaleString("es-MX")} USD</span>, pero la mercancía de este contenedor vale{" "}
          <span className="font-semibold">${(totalUsdMercancia ?? 0).toLocaleString("es-MX")} USD</span>. Si pasaste productos a otro contenedor desde el{" "}
          <Link href="/contenedores/planeador" className="underline">Planeador</Link>, los abonos se quedaron aquí: revisa si alguno corresponde al otro contenedor
          (edítalo o regístralo allá).
        </p>
      )}

      {abonos.length > 0 && (
        <ul className="mt-3 divide-y divide-zinc-100">
          {abonos.map((abono) => (
            <FilaAbono key={abono.id} contenedorId={contenedorId} abono={abono} />
          ))}
        </ul>
      )}

      <form
        action={agregar}
        className="mt-4 grid grid-cols-[1fr_1fr_auto_auto_auto] items-end gap-2 border-t border-zinc-100 pt-4"
      >
        <div>
          <label className="block text-xs font-medium text-zinc-500">Monto USD</label>
          <CampoMonto name="monto_dolares" className={claseCampo} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Tipo de cambio</label>
          <CampoNumero name="tipo_cambio" className={claseCampo} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Fecha</label>
          <CampoFecha name="fecha" defaultValue={hoyTexto} max={hoyTexto} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Estado</label>
          <div className="mt-1">
            <Selector
              name="pagado"
              defaultValue="true"
              opciones={[
                { value: "true", label: "Pagado" },
                { value: "false", label: "Pendiente" },
              ]}
            />
          </div>
        </div>
        <BotonGuardar className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
          + Agregar
        </BotonGuardar>
      </form>
    </div>
  );
}

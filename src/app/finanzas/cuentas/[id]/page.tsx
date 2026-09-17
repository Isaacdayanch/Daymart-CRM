import Link from "next/link";
import { formatoDolares, formatoPesos } from "@/lib/formato";
import { queryPeriodo } from "@/lib/estado-cuenta";
import { AjustarSaldo } from "./ajustar-saldo";
import { cargarEstadoCuenta, type ParamsPeriodo } from "./datos";
import { FilaEstadoCuenta } from "./fila-estado-cuenta";
import { FiltroMes } from "./filtro-mes";

/** Estado de cuenta de una cuenta, como el del banco: saldo inicial, cada
 * movimiento con entrada/salida y saldo corrido, saldo final. Filtro por
 * mes, impresión para el contador, Excel, y edición ahí mismo. */
export default async function EstadoCuentaPagina({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ParamsPeriodo> }) {
  const { id } = await params;
  const sp = await searchParams;
  const d = await cargarEstadoCuenta(id, sp);
  const dinero = (v: number) => (d.moneda === "USD" ? formatoDolares(v) : formatoPesos(v));
  const base = `/finanzas/cuentas/${id}`;
  const query = `${queryPeriodo(d.periodo)}${d.moneda === "USD" ? "&moneda=USD" : ""}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/finanzas/cuentas" className="text-xs text-zinc-400 hover:text-zinc-700">
            ← Mis cuentas
          </Link>
          <h2 className="mt-1 text-lg font-semibold text-zinc-900">{d.cuenta.nombre}</h2>
          <p className="text-sm text-zinc-500">
            Saldo actual: <span className="font-semibold text-zinc-900">{dinero(d.saldoActual)}</span>
            {d.tieneUsd && (
              <>
                {" · "}
                <Link href={`${base}?${queryPeriodo(d.periodo)}${d.moneda === "USD" ? "" : "&moneda=USD"}`} className="underline hover:text-zinc-900">
                  ver en {d.moneda === "USD" ? "pesos" : "dólares"}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/finanzas?cuenta=${id}`} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
            + Movimiento en esta cuenta
          </Link>
          <Link href={`${base}/imprimir?${query}`} className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            Imprimir / PDF
          </Link>
          <a href={`${base}/exportar?${query}`} className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            Descargar Excel
          </a>
        </div>
      </div>

      <FiltroMes base={base} periodo={d.periodo} hoyTexto={d.hoyTexto} />

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Saldo inicial</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">{dinero(d.estado.saldoInicial)}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs text-emerald-800">Entradas</p>
          <p className="mt-1 text-lg font-semibold text-emerald-900">{dinero(d.estado.totalEntradas)}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs text-red-800">Salidas</p>
          <p className="mt-1 text-lg font-semibold text-red-900">{dinero(d.estado.totalSalidas)}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Saldo final</p>
          <p className={`mt-1 text-lg font-semibold ${d.estado.saldoFinal < 0 ? "text-red-600" : "text-zinc-900"}`}>{dinero(d.estado.saldoFinal)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-xs text-zinc-400">
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Concepto</th>
              <th className="px-4 py-3 text-right font-medium">Entrada</th>
              <th className="px-4 py-3 text-right font-medium">Salida</th>
              <th className="px-4 py-3 text-right font-medium">Saldo</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            <tr className="bg-zinc-50/60">
              <td className="px-4 py-2.5 text-xs text-zinc-500">{d.periodo.desde.split("-").reverse().join("/")}</td>
              <td className="px-4 py-2.5 text-sm text-zinc-500" colSpan={3}>
                Saldo inicial
              </td>
              <td className="px-4 py-2.5 text-right font-medium text-zinc-700">{dinero(d.estado.saldoInicial)}</td>
              <td></td>
            </tr>
            {d.estado.renglones.map((r) => (
              <FilaEstadoCuenta key={r.movimiento.id} renglon={r} moneda={d.moneda} cuentas={d.cuentas} categorias={d.categorias} origenLigado={d.origenLigado.get(r.movimiento.id) ?? null} />
            ))}
            {d.estado.renglones.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-zinc-400">
                  Sin movimientos en este periodo.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-zinc-200 bg-zinc-50/60 text-sm font-medium">
              <td className="px-4 py-3" colSpan={2}>
                Total del periodo
              </td>
              <td className="px-4 py-3 text-right text-emerald-700">{dinero(d.estado.totalEntradas)}</td>
              <td className="px-4 py-3 text-right text-red-600">{dinero(d.estado.totalSalidas)}</td>
              <td className="px-4 py-3 text-right text-zinc-900">{dinero(d.estado.saldoFinal)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-400">
          Todo se calcula del libro de movimientos: lo que corrijas aquí cambia solo el saldo de la cuenta, el Resumen, el Balance y el inicio. Los movimientos que vienen de un contenedor, una factura, Proveedores o una venta se corrigen desde su pantalla.
        </p>
        <AjustarSaldo cuentaId={id} moneda={d.moneda} saldoSistema={d.saldoActual} hoyTexto={d.hoyTexto} />
      </div>
    </div>
  );
}

import Link from "next/link";
import { BotonImprimir } from "@/app/contenedores/[id]/imprimir/boton-imprimir";
import { Logo } from "@/components/logo";
import { formatoDolares, formatoPesos } from "@/lib/formato";
import { queryPeriodo } from "@/lib/estado-cuenta";
import { cargarEstadoCuenta, type ParamsPeriodo } from "../datos";

/** Estado de cuenta para el contador: se imprime o se guarda como PDF
 * desde el navegador (igual que la nota de venta). Sin botones de editar. */
export default async function ImprimirEstadoCuenta({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ParamsPeriodo> }) {
  const { id } = await params;
  const sp = await searchParams;
  const d = await cargarEstadoCuenta(id, sp);
  const dinero = (v: number) => (d.moneda === "USD" ? formatoDolares(v) : formatoPesos(v));
  const fecha = (t: string) => t.split("-").reverse().join("/");

  return (
    <div className="min-h-screen bg-zinc-50 print:bg-white">
      <div className="mx-auto max-w-4xl px-4 py-6 print:hidden sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/finanzas/cuentas/${id}?${queryPeriodo(d.periodo)}`} className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
            ← Volver al estado de cuenta
          </Link>
          <BotonImprimir />
        </div>
      </div>

      <main className="mx-auto max-w-4xl bg-white px-6 py-8 sm:px-10 print:px-0 print:py-0">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <Logo />
            <h1 className="mt-2 text-xl font-semibold text-zinc-900">Estado de cuenta — {d.cuenta.nombre}</h1>
            <p className="text-sm text-zinc-500">
              {d.periodo.etiqueta} · {d.moneda === "USD" ? "dólares" : "pesos"}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="text-xs text-zinc-400">Saldo final</p>
            <p className="text-lg font-semibold text-zinc-900">{dinero(d.estado.saldoFinal)}</p>
          </div>
        </div>

        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-900 text-xs text-zinc-500">
              <th className="py-2 pr-3 font-medium">Fecha</th>
              <th className="py-2 pr-3 font-medium">Concepto</th>
              <th className="py-2 pr-3 text-right font-medium">Entrada</th>
              <th className="py-2 pr-3 text-right font-medium">Salida</th>
              <th className="py-2 text-right font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-zinc-100">
              <td className="py-2 pr-3 text-zinc-500">{fecha(d.periodo.desde)}</td>
              <td className="py-2 pr-3 text-zinc-500" colSpan={3}>
                Saldo inicial
              </td>
              <td className="py-2 text-right font-medium">{dinero(d.estado.saldoInicial)}</td>
            </tr>
            {d.estado.renglones.map((r) => (
              <tr key={r.movimiento.id} className="border-b border-zinc-100 align-top">
                <td className="whitespace-nowrap py-2 pr-3 text-zinc-600">{fecha(r.fecha)}</td>
                <td className="py-2 pr-3">
                  <p className="text-zinc-900">
                    {r.concepto}
                    {r.esAjuste && <span className="ml-1 text-xs text-zinc-500">(ajuste)</span>}
                  </p>
                  {r.detalle && <p className="text-xs text-zinc-500">{r.detalle}</p>}
                </td>
                <td className="whitespace-nowrap py-2 pr-3 text-right">{r.entrada > 0 ? dinero(r.entrada) : ""}</td>
                <td className="whitespace-nowrap py-2 pr-3 text-right">{r.salida > 0 ? dinero(r.salida) : ""}</td>
                <td className="whitespace-nowrap py-2 text-right font-medium">{dinero(r.saldo)}</td>
              </tr>
            ))}
            {d.estado.renglones.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-zinc-400">
                  Sin movimientos en este periodo.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-900 font-medium">
              <td className="py-2 pr-3" colSpan={2}>
                Total del periodo
              </td>
              <td className="py-2 pr-3 text-right">{dinero(d.estado.totalEntradas)}</td>
              <td className="py-2 pr-3 text-right">{dinero(d.estado.totalSalidas)}</td>
              <td className="py-2 text-right">{dinero(d.estado.saldoFinal)}</td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-6 text-xs text-zinc-400">
          {d.estado.renglones.length.toLocaleString("es-MX")} movimientos · Generado por Daymart CRM el {fecha(d.hoyTexto)}.
        </p>
      </main>
    </div>
  );
}

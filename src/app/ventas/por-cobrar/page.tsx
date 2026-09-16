import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ventaVencida, ventasConSaldo } from "@/lib/calculos-ventas";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import type { Cliente, CobroVenta, Venta, VentaLinea } from "@/lib/tipos";
import { EstadoVenta } from "../estado-venta";

/** Todo lo que te deben los clientes, la fecha más próxima primero — para
 * saber a quién cobrarle hoy. */
export default async function PorCobrar() {
  const supabase = await createClient();
  const [{ data: ventas }, { data: lineas }, { data: cobros }, { data: clientes }] = await Promise.all([
    supabase.from("ventas").select("*").returns<Venta[]>(),
    supabase.from("venta_lineas").select("*").returns<VentaLinea[]>(),
    supabase.from("cobros_venta").select("*").returns<CobroVenta[]>(),
    supabase.from("clientes").select("*").returns<Cliente[]>(),
  ]);

  const pendientes = ventasConSaldo(ventas ?? [], lineas ?? [], cobros ?? [])
    .filter((v) => v.saldo > 0.01)
    .sort((a, b) => {
      const fa = a.venta.fecha_limite ? new Date(a.venta.fecha_limite).getTime() : Number.MAX_SAFE_INTEGER;
      const fb = b.venta.fecha_limite ? new Date(b.venta.fecha_limite).getTime() : Number.MAX_SAFE_INTEGER;
      return fa - fb;
    });
  const nombreCliente = (id: string) => clientes?.find((c) => c.id === id)?.nombre ?? "Cliente";
  const totalPorCobrar = pendientes.reduce((s, v) => s + v.saldo, 0);
  const vencido = pendientes.filter((v) => ventaVencida(v.venta, v.saldo)).reduce((s, v) => s + v.saldo, 0);

  // Resumen por cliente, para ver de un vistazo quién te debe más.
  const porCliente = new Map<string, number>();
  for (const v of pendientes) porCliente.set(v.venta.cliente_id, (porCliente.get(v.venta.cliente_id) ?? 0) + v.saldo);
  const clientesDeudores = Array.from(porCliente.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-500">
        Ventas a crédito que todavía no te terminan de pagar, ordenadas por la fecha límite más próxima.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className={`rounded-2xl border p-5 shadow-sm ${totalPorCobrar > 0 ? "border-amber-200 bg-amber-50" : "border-zinc-200 bg-white"}`}>
          <p className={`text-xs ${totalPorCobrar > 0 ? "text-amber-800" : "text-zinc-500"}`}>Te deben en total</p>
          <p className={`mt-1 text-2xl font-semibold ${totalPorCobrar > 0 ? "text-amber-900" : "text-zinc-900"}`}>
            {formatoPesos(totalPorCobrar)}
          </p>
        </div>
        <div className={`rounded-2xl border p-5 shadow-sm ${vencido > 0 ? "border-red-200 bg-red-50" : "border-zinc-200 bg-white"}`}>
          <p className={`text-xs ${vencido > 0 ? "text-red-800" : "text-zinc-500"}`}>Ya vencido</p>
          <p className={`mt-1 text-2xl font-semibold ${vencido > 0 ? "text-red-900" : "text-zinc-900"}`}>{formatoPesos(vencido)}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs text-zinc-500">Ventas pendientes</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{pendientes.length}</p>
        </div>
      </div>

      {pendientes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <p className="text-base font-medium text-zinc-900">Nadie te debe nada</p>
          <p className="mt-1 text-sm text-zinc-500">Todas tus ventas están cobradas.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-xs text-zinc-400">
                  <th className="px-5 py-3 font-medium">Venta</th>
                  <th className="px-3 py-3 font-medium">Cliente</th>
                  <th className="px-3 py-3 font-medium">Vence</th>
                  <th className="px-3 py-3 text-right font-medium">Total</th>
                  <th className="px-3 py-3 text-right font-medium">Cobrado</th>
                  <th className="px-3 py-3 text-right font-medium">Saldo</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {pendientes.map(({ venta, total, cobrado, saldo }) => (
                  <tr key={venta.id} className="transition hover:bg-zinc-50">
                    <td className="px-5 py-3">
                      <Link href={`/ventas/${venta.id}`} className="font-semibold text-zinc-900 hover:underline">
                        #{venta.numero}
                      </Link>
                      <p className="text-xs text-zinc-400">{formatoFecha(venta.fecha)}</p>
                    </td>
                    <td className="px-3 py-3 text-zinc-900">{nombreCliente(venta.cliente_id)}</td>
                    <td className="px-3 py-3 text-zinc-600">{venta.fecha_limite ? formatoFecha(venta.fecha_limite) : "Sin fecha"}</td>
                    <td className="px-3 py-3 text-right text-zinc-700">{formatoPesos(total)}</td>
                    <td className="px-3 py-3 text-right text-zinc-500">{formatoPesos(cobrado)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-amber-700">{formatoPesos(saldo)}</td>
                    <td className="px-5 py-3">
                      <EstadoVenta venta={venta} saldo={saldo} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-zinc-900">Por cliente</h3>
            <ul className="mt-3 divide-y divide-zinc-100">
              {clientesDeudores.map(([clienteId, saldo]) => (
                <li key={clienteId} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-zinc-900">{nombreCliente(clienteId)}</span>
                  <span className="font-medium text-amber-700">{formatoPesos(saldo)}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

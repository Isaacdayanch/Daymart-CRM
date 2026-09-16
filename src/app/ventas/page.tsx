import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ventasConSaldo } from "@/lib/calculos-ventas";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import type { Cliente, CobroVenta, Venta, VentaLinea } from "@/lib/tipos";
import { EstadoVenta } from "./estado-venta";

export default async function ListaVentas() {
  const supabase = await createClient();
  const [{ data: ventas, error }, { data: lineas }, { data: cobros }, { data: clientes }] = await Promise.all([
    supabase.from("ventas").select("*").order("numero", { ascending: false }).returns<Venta[]>(),
    supabase.from("venta_lineas").select("*").returns<VentaLinea[]>(),
    supabase.from("cobros_venta").select("*").returns<CobroVenta[]>(),
    supabase.from("clientes").select("*").returns<Cliente[]>(),
  ]);

  const items = ventasConSaldo(ventas ?? [], lineas ?? [], cobros ?? []);
  const nombreCliente = (id: string) => clientes?.find((c) => c.id === id)?.nombre ?? "Cliente";
  const totalVendido = items.reduce((s, v) => s + v.total, 0);
  const totalPorCobrar = items.reduce((s, v) => s + Math.max(v.saldo, 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          Ventas directas a clientes (fuera de Mercado Libre), de contado o a crédito. Cada venta descuenta el
          stock y registra el dinero en Finanzas sola.
        </p>
        <Link
          href="/ventas/nueva"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          + Nueva venta
        </Link>
      </div>

      {items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs text-zinc-500">Ventas registradas</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900">{items.length}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs text-zinc-500">Total vendido</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900">{formatoPesos(totalVendido)}</p>
          </div>
          <div className={`rounded-2xl border p-5 shadow-sm ${totalPorCobrar > 0 ? "border-amber-200 bg-amber-50" : "border-zinc-200 bg-white"}`}>
            <p className={`text-xs ${totalPorCobrar > 0 ? "text-amber-800" : "text-zinc-500"}`}>Te deben</p>
            <p className={`mt-1 text-2xl font-semibold ${totalPorCobrar > 0 ? "text-amber-900" : "text-zinc-900"}`}>
              {formatoPesos(totalPorCobrar)}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar las ventas: {error.message}
        </div>
      )}

      {!error && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <p className="text-base font-medium text-zinc-900">Aún no tienes ventas</p>
          <p className="mt-1 text-sm text-zinc-500">Registra tu primera venta directa a un cliente.</p>
          <Link
            href="/ventas/nueva"
            className="mt-4 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            + Nueva venta
          </Link>
        </div>
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-xs text-zinc-400">
                <th className="px-5 py-3 font-medium">Venta</th>
                <th className="px-3 py-3 font-medium">Fecha</th>
                <th className="px-3 py-3 font-medium">Cliente</th>
                <th className="px-3 py-3 text-right font-medium">Total</th>
                <th className="px-3 py-3 text-right font-medium">Saldo</th>
                <th className="px-5 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {items.map(({ venta, lineas: suyas, total, saldo }) => (
                <tr key={venta.id} className="transition hover:bg-zinc-50">
                  <td className="px-5 py-3">
                    <Link href={`/ventas/${venta.id}`} className="font-semibold text-zinc-900 hover:underline">
                      #{venta.numero}
                    </Link>
                    <p className="text-xs text-zinc-400">
                      {suyas.length} {suyas.length === 1 ? "producto" : "productos"}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-zinc-600">{formatoFecha(venta.fecha)}</td>
                  <td className="px-3 py-3 text-zinc-900">{nombreCliente(venta.cliente_id)}</td>
                  <td className="px-3 py-3 text-right font-medium text-zinc-900">{formatoPesos(total)}</td>
                  <td className={`px-3 py-3 text-right ${saldo > 0.01 ? "font-medium text-amber-700" : "text-zinc-400"}`}>
                    {saldo > 0.01 ? formatoPesos(saldo) : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <EstadoVenta venta={venta} saldo={saldo} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

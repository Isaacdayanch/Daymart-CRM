import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cargarOrdenes } from "@/lib/compras";
import { ordenesPorRecibir } from "@/lib/calculos-compras";
import { fechaTextoMx } from "@/lib/fechas-mx";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { EstadoOrden } from "./estado-orden";

export default async function ListaOrdenes() {
  const supabase = await createClient();
  const { ordenes, error } = await cargarOrdenes(supabase);
  const hoy = fechaTextoMx(new Date());
  const vencidas = new Set(ordenesPorRecibir(ordenes.map((o) => o.orden), hoy).filter((o) => o.vencida).map((o) => o.orden.id));
  const abiertas = ordenes.filter((o) => o.orden.estado === "PEDIDA" || o.orden.estado === "PARCIAL");
  const piezasPorRecibir = abiertas.reduce((s, o) => s + Math.max(0, o.piezas - o.piezasRecibidas), 0);
  const porPagar = ordenes.filter((o) => o.orden.estado !== "CANCELADA").reduce((s, o) => s + o.saldo, 0);
  const num = (n: number) => n.toLocaleString("es-MX");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-zinc-500">
          Lo que le compras a proveedores de México. Cada orden entra al stock cuando la recibes y su cuenta por pagar vive en Finanzas → Facturas; los pagos se registran aquí o allá, es el mismo registro.
        </p>
        <Link href="/compras/nueva" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
          + Nueva orden
        </Link>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {ordenes.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs text-zinc-500">Órdenes abiertas</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900">{abiertas.length}</p>
            <p className="text-xs text-zinc-400">de {ordenes.length} en total</p>
          </div>
          <Link href="/compras/por-recibir" className={`rounded-2xl border p-5 shadow-sm transition ${piezasPorRecibir > 0 ? "border-sky-200 bg-sky-50 hover:border-sky-300" : "border-zinc-200 bg-white"}`}>
            <p className={`text-xs ${piezasPorRecibir > 0 ? "text-sky-800" : "text-zinc-500"}`}>Piezas por recibir</p>
            <p className={`mt-1 text-2xl font-semibold ${piezasPorRecibir > 0 ? "text-sky-900" : "text-zinc-900"}`}>{num(piezasPorRecibir)}</p>
            <p className={`text-xs ${piezasPorRecibir > 0 ? "text-sky-700" : "text-zinc-400"}`}>{vencidas.size > 0 ? `${vencidas.size} ${vencidas.size === 1 ? "orden atrasada" : "órdenes atrasadas"} →` : "Ver qué viene en camino →"}</p>
          </Link>
          <div className={`rounded-2xl border p-5 shadow-sm ${porPagar > 0.01 ? "border-amber-200 bg-amber-50" : "border-zinc-200 bg-white"}`}>
            <p className={`text-xs ${porPagar > 0.01 ? "text-amber-800" : "text-zinc-500"}`}>Por pagar a proveedores</p>
            <p className={`mt-1 text-2xl font-semibold ${porPagar > 0.01 ? "text-amber-900" : "text-zinc-900"}`}>{formatoPesos(porPagar)}</p>
            <p className={`text-xs ${porPagar > 0.01 ? "text-amber-700" : "text-zinc-400"}`}>IVA incluido · también en Finanzas → Facturas</p>
          </div>
        </div>
      )}

      {!error && ordenes.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <p className="text-base font-medium text-zinc-900">Aún no tienes órdenes de compra</p>
          <p className="mt-1 text-sm text-zinc-500">Registra tu primera compra a un proveedor de México: se la mandas, la recibes y entra al stock sola.</p>
          <Link href="/compras/nueva" className="mt-4 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
            + Nueva orden
          </Link>
        </div>
      )}

      {ordenes.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-xs text-zinc-400">
                <th className="px-5 py-3 font-medium">Orden</th>
                <th className="px-3 py-3 font-medium">Fecha</th>
                <th className="px-3 py-3 font-medium">Proveedor</th>
                <th className="px-3 py-3 text-right font-medium">Piezas</th>
                <th className="px-3 py-3 text-right font-medium">Total</th>
                <th className="px-3 py-3 text-right font-medium">Por pagar</th>
                <th className="px-5 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {ordenes.map((o) => (
                <tr key={o.orden.id} className={`transition hover:bg-zinc-50 ${o.orden.estado === "CANCELADA" ? "text-zinc-400" : ""}`}>
                  <td className="px-5 py-3">
                    <Link href={`/compras/${o.orden.id}`} className="font-semibold text-zinc-900 hover:underline">
                      #{o.orden.numero}
                    </Link>
                    <p className="text-xs text-zinc-400">
                      {o.lineas.length} {o.lineas.length === 1 ? "producto" : "productos"}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-zinc-600">
                    {formatoFecha(o.orden.fecha)}
                    {o.orden.fecha_entrega && (o.orden.estado === "PEDIDA" || o.orden.estado === "PARCIAL") && (
                      <p className={`text-xs ${vencidas.has(o.orden.id) ? "text-red-600" : "text-zinc-400"}`}>entrega {formatoFecha(o.orden.fecha_entrega)}</p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-zinc-900">{o.proveedor?.nombre ?? "—"}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-zinc-700">
                    {o.orden.estado === "PEDIDA" || o.orden.estado === "CANCELADA" ? num(o.piezas) : `${num(o.piezasRecibidas)} / ${num(o.piezas)}`}
                  </td>
                  <td className="px-3 py-3 text-right font-medium tabular-nums text-zinc-900">{formatoPesos(o.total)}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${o.saldo > 0.01 ? "font-medium text-amber-700" : "text-zinc-400"}`}>{o.saldo > 0.01 ? formatoPesos(o.saldo) : "—"}</td>
                  <td className="px-5 py-3">
                    <EstadoOrden estado={o.orden.estado} vencida={vencidas.has(o.orden.id)} />
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

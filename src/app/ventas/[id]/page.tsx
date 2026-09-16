import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  cobradoVenta,
  costoVenta,
  ivaVenta,
  margenVenta,
  margenVentaPct,
  saldoVenta,
  subtotalVenta,
  totalVenta,
} from "@/lib/calculos-ventas";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { IVA_PCT, type Bodega, type Cliente, type CobroVenta, type CuentaFinanciera, type Venta, type VentaLinea } from "@/lib/tipos";
import { EstadoVenta } from "../estado-venta";
import { Cobros } from "./cobros";
import { BotonEliminarVenta } from "./boton-eliminar-venta";

export default async function DetalleVenta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: venta } = await supabase.from("ventas").select("*").eq("id", id).maybeSingle<Venta>();
  if (!venta) notFound();

  const [{ data: lineas }, { data: cobros }, { data: cliente }, { data: bodega }, { data: cuentas }] = await Promise.all([
    supabase.from("venta_lineas").select("*").eq("venta_id", id).order("orden").returns<VentaLinea[]>(),
    supabase.from("cobros_venta").select("*").eq("venta_id", id).order("fecha").returns<CobroVenta[]>(),
    supabase.from("clientes").select("*").eq("id", venta.cliente_id).maybeSingle<Cliente>(),
    supabase.from("bodegas").select("*").eq("id", venta.bodega_id).maybeSingle<Bodega>(),
    supabase.from("cuentas_financieras").select("*").is("eliminado_en", null).order("nombre").returns<CuentaFinanciera[]>(),
  ]);

  const listaLineas = lineas ?? [];
  const listaCobros = cobros ?? [];
  const subtotal = subtotalVenta(listaLineas);
  const iva = ivaVenta(venta, listaLineas);
  const total = totalVenta(venta, listaLineas);
  const cobrado = cobradoVenta(listaCobros);
  const saldo = saldoVenta(venta, listaLineas, listaCobros);
  const costo = costoVenta(listaLineas);
  const margen = margenVenta(listaLineas);
  const margenPct = margenVentaPct(listaLineas);
  const piezas = listaLineas.reduce((s, l) => s + l.cantidad, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-zinc-900">Venta #{venta.numero}</h2>
            <EstadoVenta venta={venta} saldo={saldo} />
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {cliente?.nombre ?? "Cliente"}
            {cliente?.telefono ? ` · ${cliente.telefono}` : ""} · {formatoFecha(venta.fecha)}
            {bodega ? ` · salió de ${bodega.nombre}` : ""}
          </p>
          {venta.notas && <p className="mt-1 text-sm text-zinc-500">{venta.notas}</p>}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/ventas/${venta.id}/imprimir`}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Nota de venta
          </Link>
          <BotonEliminarVenta ventaId={venta.id} numero={venta.numero} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs text-zinc-500">Total de la venta</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{formatoPesos(total)}</p>
          <p className="text-xs text-zinc-400">
            {piezas.toLocaleString("es-MX")} piezas{venta.con_iva ? ` · incluye IVA ${IVA_PCT}%` : " · sin IVA"}
          </p>
        </div>
        <div className={`rounded-2xl border p-5 shadow-sm ${saldo > 0.01 ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
          <p className={`text-xs ${saldo > 0.01 ? "text-amber-800" : "text-emerald-800"}`}>
            {saldo > 0.01 ? "Te debe" : "Cobrado completo"}
          </p>
          <p className={`mt-1 text-2xl font-semibold ${saldo > 0.01 ? "text-amber-900" : "text-emerald-900"}`}>
            {formatoPesos(saldo > 0.01 ? saldo : cobrado)}
          </p>
          {saldo > 0.01 && venta.fecha_limite && (
            <p className="text-xs text-amber-800">
              vence {formatoFecha(venta.fecha_limite)} · llevas {formatoPesos(cobrado)}
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs text-zinc-500">Ganancia bruta (sin IVA)</p>
          <p className={`mt-1 text-2xl font-semibold ${margen >= 0 ? "text-emerald-700" : "text-red-700"}`}>
            {formatoPesos(margen)}
          </p>
          <p className="text-xs text-zinc-400">
            {margenPct.toFixed(0)}% · te costó {formatoPesos(costo)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-xs text-zinc-400">
              <th className="px-5 py-3 font-medium"></th>
              <th className="px-3 py-3 font-medium">Producto</th>
              <th className="px-3 py-3 text-right font-medium">Cant.</th>
              <th className="px-3 py-3 text-right font-medium">Precio/pza</th>
              <th className="px-3 py-3 text-right font-medium">Importe</th>
              <th className="px-5 py-3 text-right font-medium">Costo/pza</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {listaLineas.map((l) => (
              <tr key={l.id}>
                <td className="px-5 py-2">
                  {l.imagen_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura chica en tabla
                    <img src={l.imagen_url} alt={l.nombre} className="h-10 w-10 rounded-lg object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-zinc-100" />
                  )}
                </td>
                <td className="px-3 py-2">
                  <Link href={`/stock/producto/${encodeURIComponent(l.sku)}`} className="font-medium text-zinc-900 hover:underline">
                    {l.nombre}
                  </Link>
                  <p className="font-mono text-xs text-zinc-400">{l.sku}</p>
                </td>
                <td className="px-3 py-2 text-right text-zinc-900">{l.cantidad.toLocaleString("es-MX")}</td>
                <td className="px-3 py-2 text-right text-zinc-700">{formatoPesos(l.precio_unitario)}</td>
                <td className="px-3 py-2 text-right font-medium text-zinc-900">{formatoPesos(l.cantidad * l.precio_unitario)}</td>
                <td className="px-5 py-2 text-right text-xs text-zinc-400">{formatoPesos(l.costo_unitario)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-zinc-100 text-sm">
            <tr>
              <td colSpan={4} className="px-5 py-2 text-right text-zinc-500">Subtotal</td>
              <td className="px-3 py-2 text-right text-zinc-900">{formatoPesos(subtotal)}</td>
              <td></td>
            </tr>
            {venta.con_iva && (
              <tr>
                <td colSpan={4} className="px-5 py-2 text-right text-zinc-500">IVA ({IVA_PCT}%)</td>
                <td className="px-3 py-2 text-right text-zinc-900">{formatoPesos(iva)}</td>
                <td></td>
              </tr>
            )}
            <tr className="font-semibold">
              <td colSpan={4} className="px-5 py-2 text-right text-zinc-900">Total</td>
              <td className="px-3 py-2 text-right text-zinc-900">{formatoPesos(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <Cobros ventaId={venta.id} cobros={listaCobros} cuentas={cuentas ?? []} saldo={saldo} formaPago={venta.forma_pago} />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cobradoVenta, ivaVenta, saldoVenta, subtotalVenta, totalVenta } from "@/lib/calculos-ventas";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { IVA_PCT, type Cliente, type CobroVenta, type Venta, type VentaLinea } from "@/lib/tipos";
import { BotonImprimir } from "@/app/contenedores/[id]/imprimir/boton-imprimir";
import { Logo } from "@/components/logo";

/** Nota de venta para el cliente: se imprime o se guarda como PDF desde el
 * navegador (sin librería de PDF, igual que el packing list). Sin costos
 * ni márgenes — solo lo que el cliente debe ver. */
export default async function ImprimirVenta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: venta } = await supabase.from("ventas").select("*").eq("id", id).maybeSingle<Venta>();
  if (!venta) notFound();

  const [{ data: lineas }, { data: cobros }, { data: cliente }] = await Promise.all([
    supabase.from("venta_lineas").select("*").eq("venta_id", id).order("orden").returns<VentaLinea[]>(),
    supabase.from("cobros_venta").select("*").eq("venta_id", id).order("fecha").returns<CobroVenta[]>(),
    supabase.from("clientes").select("*").eq("id", venta.cliente_id).maybeSingle<Cliente>(),
  ]);

  const listaLineas = lineas ?? [];
  const listaCobros = cobros ?? [];
  const subtotal = subtotalVenta(listaLineas);
  const iva = ivaVenta(venta, listaLineas);
  const total = totalVenta(venta, listaLineas);
  const cobrado = cobradoVenta(listaCobros);
  const saldo = saldoVenta(venta, listaLineas, listaCobros);

  return (
    <div className="min-h-screen bg-zinc-50 print:bg-white">
      <div className="mx-auto max-w-3xl px-4 py-6 print:hidden sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/ventas/${id}`} className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
            ← Volver a la venta
          </Link>
          <BotonImprimir />
        </div>
      </div>

      <main className="mx-auto max-w-3xl bg-white px-6 py-8 sm:px-10 print:px-0 print:py-0">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <Logo />
            <h1 className="mt-2 text-xl font-semibold text-zinc-900">Nota de venta #{venta.numero}</h1>
            <p className="text-sm text-zinc-500">{formatoFecha(venta.fecha)}</p>
          </div>
          <div className="text-right text-sm">
            <p className="text-xs text-zinc-400">Cliente</p>
            <p className="font-medium text-zinc-900">{cliente?.nombre ?? "Cliente"}</p>
            {cliente?.telefono && <p className="text-zinc-500">{cliente.telefono}</p>}
          </div>
        </div>

        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-900 text-xs text-zinc-500">
              <th className="py-2 pr-2 font-medium">Producto</th>
              <th className="py-2 pr-2 text-right font-medium">Cant.</th>
              <th className="py-2 pr-2 text-right font-medium">Precio</th>
              <th className="py-2 text-right font-medium">Importe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {listaLineas.map((l) => (
              <tr key={l.id}>
                <td className="py-2 pr-2">
                  <p className="text-zinc-900">{l.nombre}</p>
                  <p className="font-mono text-xs text-zinc-400">{l.sku}</p>
                </td>
                <td className="py-2 pr-2 text-right">{l.cantidad.toLocaleString("es-MX")}</td>
                <td className="py-2 pr-2 text-right">{formatoPesos(l.precio_unitario)}</td>
                <td className="py-2 text-right font-medium">{formatoPesos(l.cantidad * l.precio_unitario)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-900">
              <td colSpan={3} className="py-2 pr-2 text-right text-zinc-500">Subtotal</td>
              <td className="py-2 text-right">{formatoPesos(subtotal)}</td>
            </tr>
            {venta.con_iva && (
              <tr>
                <td colSpan={3} className="py-1 pr-2 text-right text-zinc-500">IVA ({IVA_PCT}%)</td>
                <td className="py-1 text-right">{formatoPesos(iva)}</td>
              </tr>
            )}
            <tr className="text-base font-semibold">
              <td colSpan={3} className="py-2 pr-2 text-right">Total</td>
              <td className="py-2 text-right">{formatoPesos(total)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-8 grid gap-6 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-zinc-400">Forma de pago</p>
            <p className="text-zinc-900">
              {venta.forma_pago === "CONTADO" ? "De contado" : "A crédito"}
              {venta.forma_pago === "CREDITO" && venta.fecha_limite && ` · vence ${formatoFecha(venta.fecha_limite)}`}
            </p>
            {listaCobros.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-zinc-500">
                {listaCobros.map((c) => (
                  <li key={c.id}>
                    Pago {formatoFecha(c.fecha)}: {formatoPesos(c.monto)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-400">Pagado</p>
            <p className="text-zinc-900">{formatoPesos(cobrado)}</p>
            <p className="mt-2 text-xs text-zinc-400">Saldo pendiente</p>
            <p className={`text-lg font-semibold ${saldo > 0.01 ? "text-zinc-900" : "text-emerald-700"}`}>
              {saldo > 0.01 ? formatoPesos(saldo) : "Liquidado"}
            </p>
          </div>
        </div>

        {venta.notas && <p className="mt-8 border-t border-zinc-200 pt-4 text-sm text-zinc-500">{venta.notas}</p>}
      </main>
    </div>
  );
}

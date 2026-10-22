import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cargarOrdenes } from "@/lib/compras";
import { ivaIncluido } from "@/lib/calculos-compras";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { CONDICIONES_PAGO, IVA_PCT, type Bodega } from "@/lib/tipos";
import { BotonImprimir } from "@/app/contenedores/[id]/imprimir/boton-imprimir";
import { Logo } from "@/components/logo";

/** Orden de compra para el proveedor: se imprime o se guarda como PDF desde
 * el navegador (igual que la nota de venta). Solo lo que el proveedor debe
 * ver: productos, cantidades, precios, entrega y condiciones. */
export default async function ImprimirOrden({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ ordenes }, { data: bodegas }] = await Promise.all([cargarOrdenes(supabase), supabase.from("bodegas").select("*").returns<Bodega[]>()]);
  const datos = ordenes.find((o) => o.orden.id === id);
  if (!datos) notFound();
  const { orden, lineas, proveedor, total } = datos;
  const bodega = (bodegas ?? []).find((b) => b.id === orden.bodega_id);
  const condiciones = CONDICIONES_PAGO.find((c) => c.valor === orden.condiciones_pago)?.etiqueta ?? orden.condiciones_pago;
  const num = (n: number) => n.toLocaleString("es-MX");

  return (
    <div className="min-h-screen bg-zinc-50 print:bg-white">
      <div className="mx-auto max-w-3xl px-4 py-6 print:hidden sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/compras/${id}`} className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
            ← Volver a la orden
          </Link>
          <BotonImprimir />
        </div>
      </div>

      <main className="mx-auto max-w-3xl bg-white px-6 py-8 sm:px-10 print:px-0 print:py-0">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <Logo />
            <h1 className="mt-2 text-xl font-semibold text-zinc-900">Orden de compra #{orden.numero}</h1>
            <p className="text-sm text-zinc-500">{formatoFecha(orden.fecha)}</p>
          </div>
          <div className="text-right text-sm">
            <p className="text-xs text-zinc-400">Proveedor</p>
            <p className="font-medium text-zinc-900">{proveedor?.nombre ?? "Proveedor"}</p>
            {proveedor?.contacto && <p className="text-zinc-500">{proveedor.contacto}</p>}
            {proveedor?.telefono && <p className="text-zinc-500">{proveedor.telefono}</p>}
          </div>
        </div>

        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-900 text-xs text-zinc-500">
              <th className="py-2 pr-2 font-medium"></th>
              <th className="py-2 pr-2 font-medium">Producto</th>
              <th className="py-2 pr-2 text-right font-medium">Cantidad</th>
              <th className="py-2 pr-2 text-right font-medium">Precio</th>
              <th className="py-2 text-right font-medium">Importe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {lineas.map((l) => (
              <tr key={l.id}>
                <td className="py-2 pr-2">
                  {l.imagen_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- foto en la orden impresa
                    <img src={l.imagen_url} alt="" className="h-12 w-12 rounded-md object-cover" />
                  ) : null}
                </td>
                <td className="py-2 pr-2">
                  <p className="text-zinc-900">{l.nombre}</p>
                  <p className="font-mono text-xs text-zinc-400">{l.sku}</p>
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{num(l.cantidad)} pzas</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatoPesos(l.precio_unitario)}</td>
                <td className="py-2 text-right font-medium tabular-nums">{formatoPesos(l.cantidad * l.precio_unitario)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {orden.flete > 0 && (
              <>
                <tr className="border-t-2 border-zinc-900">
                  <td colSpan={4} className="py-2 pr-2 text-right text-zinc-500">Mercancía</td>
                  <td className="py-2 text-right tabular-nums">{formatoPesos(total - orden.flete)}</td>
                </tr>
                <tr>
                  <td colSpan={4} className="py-1 pr-2 text-right text-zinc-500">Flete</td>
                  <td className="py-1 text-right tabular-nums">{formatoPesos(orden.flete)}</td>
                </tr>
              </>
            )}
            <tr className={`text-base font-semibold ${orden.flete > 0 ? "" : "border-t-2 border-zinc-900"}`}>
              <td colSpan={4} className="py-2 pr-2 text-right">Total</td>
              <td className="py-2 text-right tabular-nums">{formatoPesos(total)}</td>
            </tr>
            <tr className="text-xs text-zinc-400">
              <td colSpan={4} className="pr-2 text-right">IVA {IVA_PCT}% incluido</td>
              <td className="text-right tabular-nums">{formatoPesos(ivaIncluido(total))}</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-8 grid gap-6 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-zinc-400">Entrega</p>
            <p className="text-zinc-900">{orden.fecha_entrega ? formatoFecha(orden.fecha_entrega) : "Por acordar"}</p>
            {bodega && <p className="text-zinc-500">Entregar en: {bodega.nombre}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-xs text-zinc-400">Condiciones de pago</p>
            <p className="text-zinc-900">
              {condiciones}
              {orden.condiciones_pago === "CREDITO" && orden.dias_credito ? ` · ${orden.dias_credito} días` : ""}
            </p>
          </div>
        </div>

        {orden.notas_proveedor && <p className="mt-8 border-t border-zinc-200 pt-4 text-sm text-zinc-700">{orden.notas_proveedor}</p>}
        <p className="mt-10 text-center text-[11px] text-zinc-400">Daymart · {num(lineas.reduce((s, l) => s + l.cantidad, 0))} piezas en {lineas.length} {lineas.length === 1 ? "producto" : "productos"}</p>
      </main>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/servicio";
import { ESTADOS_ORDEN, type OrdenItemMl, type OrdenMl } from "@/lib/mercadolibre-ordenes";
import { comisionOrden, netoOrden, origenComisionOrden, totalVendidoOrden } from "@/lib/mercadolibre-montos";
import { formatoFechaHoraMx } from "@/lib/fechas-mx";
import { formatoPesos } from "@/lib/formato";

// Desglose de UNA orden de Mercado Libre, para compararlo contra el
// "Detalle de cobro" de la app de ML. Abajo, los datos crudos que mandó ML
// (por si algún número no cuadra, Isaac manda una captura de esta pantalla).

const ORIGEN_COMISION: Record<ReturnType<typeof origenComisionOrden>, string> = {
  mercado_pago: "la reporta Mercado Pago en el cobro",
  sale_fee: "la reporta Mercado Libre en la orden",
  derivada: "diferencia entre lo que pagó el comprador y el valor del producto",
  ninguna: "Mercado Libre no reportó comisión",
};

function Renglon({ etiqueta, valor, nota, tono }: { etiqueta: string; valor: string; nota?: string; tono?: "rojo" | "verde" | "fuerte" }) {
  const color = tono === "rojo" ? "text-red-600" : tono === "verde" ? "text-emerald-700" : "text-zinc-900";
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3 text-sm">
      <div>
        <p className="text-zinc-700">{etiqueta}</p>
        {nota && <p className="text-xs text-zinc-400">{nota}</p>}
      </div>
      <p className={`whitespace-nowrap ${tono === "fuerte" || tono === "verde" ? "font-semibold" : "font-medium"} ${color}`}>{valor}</p>
    </div>
  );
}

function texto(v: unknown) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return v.toLocaleString("es-MX", { maximumFractionDigits: 2 });
  return String(v);
}

export default async function DetalleOrdenMl({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ordenId = Number(id);
  if (!Number.isFinite(ordenId)) notFound();

  const supabase = createServiceClient();
  const [{ data: orden }, { data: items }] = await Promise.all([
    supabase.from("mercadolibre_ordenes").select("*").eq("id", ordenId).maybeSingle<OrdenMl & { payload: Record<string, unknown> | null }>(),
    supabase.from("mercadolibre_orden_items").select("*").eq("orden_id", ordenId).returns<OrdenItemMl[]>(),
  ]);
  if (!orden) notFound();

  const vendido = totalVendidoOrden(orden);
  const comision = comisionOrden(orden);
  const neto = netoOrden(orden);
  const origen = origenComisionOrden(orden);
  const envioComprador = orden.envio_comprador ?? 0;
  const pagado = orden.pagado_comprador ?? null;
  const valorProductoDistinto = Math.abs(vendido - orden.total) > 0.5;

  // Datos crudos (solo lo que sirve para cuadrar montos).
  const crudo = (orden.payload ?? {}) as {
    total_amount?: number;
    paid_amount?: number;
    order_items?: { unit_price?: number; full_unit_price?: number; sale_fee?: number; quantity?: number; listing_type_id?: string }[];
    payments?: { id?: number; status?: string; transaction_amount?: number; total_paid_amount?: number; shipping_cost?: number; marketplace_fee?: number; coupon_amount?: number; taxes_amount?: number }[];
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/mercadolibre" className="text-xs font-medium text-zinc-500 hover:text-zinc-900">
          ← Ventas
        </Link>
        <h2 className="mt-1 text-lg font-semibold text-zinc-900">Orden #{orden.id}</h2>
        <p className="text-sm text-zinc-500">
          {formatoFechaHoraMx(orden.fecha_creacion)} · {orden.comprador_nickname ?? orden.comprador_nombre ?? "comprador"} ·{" "}
          {ESTADOS_ORDEN[orden.estado ?? ""] ?? orden.estado ?? "?"}
          {orden.logistica ? ` · ${orden.logistica}` : ""}
          {orden.pack_id ? " · parte de un carrito" : ""}
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 p-5">
          <h3 className="text-sm font-semibold text-zinc-900">Productos</h3>
        </div>
        <ul className="divide-y divide-zinc-50">
          {(items ?? []).map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              {i.imagen_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- miniatura de Mercado Libre
                <img src={i.imagen_url} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
              ) : (
                <div className="h-10 w-10 shrink-0 rounded-md bg-zinc-100" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-zinc-900">
                  <span className="font-semibold">{i.cantidad}×</span> {i.titulo}
                </p>
                <p className="text-xs text-zinc-400">
                  {i.variacion ? `${i.variacion} · ` : ""}
                  {i.seller_sku ? `SKU ${i.seller_sku} · ` : ""}
                  {formatoPesos(i.precio_unitario)} c/u según la orden
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 p-5">
          <h3 className="text-sm font-semibold text-zinc-900">Desglose del cobro</h3>
          <p className="mt-0.5 text-xs text-zinc-500">Para compararlo con el “Detalle de cobro” de la app de Mercado Libre.</p>
        </div>
        <div className="divide-y divide-zinc-50">
          {pagado !== null && (
            <Renglon etiqueta="Pagó el comprador" valor={formatoPesos(pagado)} nota={envioComprador > 0 ? `incluye ${formatoPesos(envioComprador)} de envío que pagó él` : undefined} />
          )}
          <Renglon etiqueta="Valor de la venta" valor={formatoPesos(vendido)} tono="fuerte" nota={pagado === null ? "Total de la orden (Mercado Libre no mandó el detalle del cobro)" : undefined} />
          <Renglon etiqueta="Comisión de Mercado Libre" valor={comision ? `-${formatoPesos(comision)}` : "$0"} tono="rojo" nota={ORIGEN_COMISION[origen]} />
          <Renglon
            etiqueta="Envío a tu cargo"
            valor={orden.costo_envio_vendedor !== null ? (orden.costo_envio_vendedor ? `-${formatoPesos(orden.costo_envio_vendedor)}` : "$0") : "…"}
            tono="rojo"
            nota={orden.costo_envio_vendedor === null ? "Mercado Libre todavía no publica el costo (normalmente al despachar)" : undefined}
          />
          <Renglon etiqueta="Te queda" valor={formatoPesos(neto)} tono="verde" nota="antes de tu costo de producto" />
          {valorProductoDistinto && (
            <Renglon etiqueta="Valor del producto según Mercado Libre" valor={formatoPesos(orden.total)} nota="Es el monto por el que le facturas a Mercado Libre (comisión y envío ya descontados)" />
          )}
        </div>
      </div>

      <details className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <summary className="cursor-pointer p-5 text-sm font-semibold text-zinc-900">Datos crudos que mandó Mercado Libre</summary>
        <div className="border-t border-zinc-100 px-5 py-4 text-xs text-zinc-600">
          <p className="mb-3 text-zinc-500">Si algún número de arriba no cuadra con tu app, manda una captura de esta parte.</p>
          <table className="w-full">
            <tbody className="divide-y divide-zinc-50">
              <tr><td className="py-1.5 pr-3 text-zinc-400">total_amount</td><td className="py-1.5 text-right">{texto(crudo.total_amount)}</td></tr>
              <tr><td className="py-1.5 pr-3 text-zinc-400">paid_amount</td><td className="py-1.5 text-right">{texto(crudo.paid_amount)}</td></tr>
              {(crudo.order_items ?? []).map((i, n) => (
                <tr key={`i${n}`}>
                  <td className="py-1.5 pr-3 text-zinc-400">renglón {n + 1}</td>
                  <td className="py-1.5 text-right">
                    cantidad {texto(i.quantity)} · unit_price {texto(i.unit_price)} · full_unit_price {texto(i.full_unit_price)} · sale_fee {texto(i.sale_fee)} · {i.listing_type_id ?? "—"}
                  </td>
                </tr>
              ))}
              {(crudo.payments ?? []).map((p, n) => (
                <tr key={`p${n}`}>
                  <td className="py-1.5 pr-3 text-zinc-400">cobro {p.id ?? n + 1}</td>
                  <td className="py-1.5 text-right">
                    {p.status ?? "—"} · transaction_amount {texto(p.transaction_amount)} · total_paid_amount {texto(p.total_paid_amount)} · shipping_cost {texto(p.shipping_cost)} · marketplace_fee {texto(p.marketplace_fee)} · coupon_amount {texto(p.coupon_amount)} · taxes_amount {texto(p.taxes_amount)}
                  </td>
                </tr>
              ))}
              {!crudo.payments?.length && (
                <tr><td className="py-1.5 pr-3 text-zinc-400">cobros</td><td className="py-1.5 text-right">la orden no trae datos de pago</td></tr>
              )}
            </tbody>
          </table>
          <p className="mt-3 text-zinc-400">
            Guardado: comisión {texto(orden.comision)} · comisión Mercado Pago {texto(orden.comision_mp)} · pagó comprador {texto(orden.pagado_comprador)} · envío comprador {texto(orden.envio_comprador)} · envío vendedor {texto(orden.costo_envio_vendedor)}
          </p>
        </div>
      </details>
    </div>
  );
}

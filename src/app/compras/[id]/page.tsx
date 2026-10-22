import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cargarOrdenes } from "@/lib/compras";
import { costoUnitarioConFlete, ivaIncluido, ordenesPorRecibir, textoEntrega, textoOrdenWhatsApp } from "@/lib/calculos-compras";
import { fechaTextoMx } from "@/lib/fechas-mx";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { CONDICIONES_PAGO, IVA_PCT, type Bodega, type CuentaFinanciera } from "@/lib/tipos";
import { EstadoOrden } from "../estado-orden";
import { Recepcion } from "./recepcion";
import { FacturaPagos } from "./factura-pagos";
import { AccionesOrden } from "./acciones-orden";

export default async function DetalleOrden({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ ordenes }, { data: bodegas }, { data: cuentas }] = await Promise.all([
    cargarOrdenes(supabase),
    supabase.from("bodegas").select("*").is("eliminado_en", null).order("nombre").returns<Bodega[]>(),
    supabase.from("cuentas_financieras").select("*").is("eliminado_en", null).order("nombre").returns<CuentaFinanciera[]>(),
  ]);
  const datos = ordenes.find((o) => o.orden.id === id);
  if (!datos) notFound();
  const { orden, lineas, proveedor, factura, pagos, total, recibido, pagado, saldo, piezas, piezasRecibidas } = datos;
  const abierta = orden.estado === "PEDIDA" || orden.estado === "PARCIAL";
  const entrega = ordenesPorRecibir([orden], fechaTextoMx(new Date()))[0];
  const vencida = Boolean(entrega?.vencida);
  const bodega = (bodegas ?? []).find((b) => b.id === orden.bodega_id);
  const condiciones = CONDICIONES_PAGO.find((c) => c.valor === orden.condiciones_pago)?.etiqueta ?? orden.condiciones_pago;
  const editable = orden.estado === "PEDIDA" && lineas.every((l) => l.cantidad_recibida <= 0);
  const num = (n: number) => n.toLocaleString("es-MX");
  const whatsapp = textoOrdenWhatsApp({
    numero: orden.numero,
    proveedor: proveedor?.nombre ?? "Proveedor",
    fechaTexto: formatoFecha(orden.fecha),
    fechaEntregaTexto: orden.fecha_entrega ? formatoFecha(orden.fecha_entrega) : null,
    lineas,
    flete: orden.flete,
    notasProveedor: orden.notas_proveedor,
    entregarEn: bodega?.nombre ?? null,
  });
  const telefono = proveedor?.telefono?.replace(/\D/g, "") ?? "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-zinc-900">Orden de compra #{orden.numero}</h2>
            <EstadoOrden estado={orden.estado} vencida={vencida} />
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {proveedor?.nombre ?? "Proveedor"}
            {proveedor?.telefono ? ` · ${proveedor.telefono}` : ""} · pedida el {formatoFecha(orden.fecha)}
            {bodega ? ` · llega a ${bodega.nombre}` : ""}
          </p>
          <p className={`mt-0.5 text-sm ${vencida ? "font-medium text-red-700" : "text-zinc-500"}`}>
            {abierta ? (
              <>
                {textoEntrega(entrega?.diasParaEntrega ?? null)}
                {orden.fecha_entrega ? ` (${formatoFecha(orden.fecha_entrega)})` : ""}
              </>
            ) : orden.estado === "RECIBIDA" && orden.recibida_en ? (
              `recibida el ${formatoFecha(orden.recibida_en)}`
            ) : orden.cancelada_en ? (
              `cancelada el ${formatoFecha(orden.cancelada_en)}`
            ) : null}
            {" · "}
            {condiciones}
            {orden.condiciones_pago === "CREDITO" && orden.dias_credito ? ` ${orden.dias_credito} días` : ""}
          </p>
          {orden.notas && <p className="mt-1 text-sm text-zinc-500">{orden.notas}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/compras/${orden.id}/imprimir`} className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            Orden en PDF
          </Link>
          <a
            href={`https://wa.me/${telefono}?text=${encodeURIComponent(whatsapp)}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
          >
            Mandar por WhatsApp
          </a>
          {editable && (
            <Link href={`/compras/${orden.id}/editar`} className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
              Editar
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs text-zinc-500">Total de la orden</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{formatoPesos(total)}</p>
          <p className="text-xs text-zinc-400">
            {num(piezas)} piezas · IVA incluido ({formatoPesos(ivaIncluido(total))})
          </p>
        </div>
        <div className={`rounded-2xl border p-5 shadow-sm ${orden.estado === "RECIBIDA" ? "border-emerald-200 bg-emerald-50" : orden.estado === "CANCELADA" ? "border-zinc-200 bg-zinc-50" : "border-sky-200 bg-sky-50"}`}>
          <p className={`text-xs ${orden.estado === "RECIBIDA" ? "text-emerald-800" : orden.estado === "CANCELADA" ? "text-zinc-500" : "text-sky-800"}`}>
            {orden.estado === "RECIBIDA" ? "Recibida completa" : orden.estado === "CANCELADA" ? "Cancelada" : "Recibido"}
          </p>
          <p className={`mt-1 text-2xl font-semibold ${orden.estado === "RECIBIDA" ? "text-emerald-900" : orden.estado === "CANCELADA" ? "text-zinc-500" : "text-sky-900"}`}>
            {num(piezasRecibidas)} <span className="text-base font-normal">de {num(piezas)} pzas</span>
          </p>
          <p className={`text-xs ${orden.estado === "RECIBIDA" ? "text-emerald-700" : orden.estado === "CANCELADA" ? "text-zinc-400" : "text-sky-700"}`}>
            {recibido > 0 ? `${formatoPesos(recibido)} ya en tu stock` : "nada en stock todavía"}
          </p>
        </div>
        <div className={`rounded-2xl border p-5 shadow-sm ${saldo > 0.01 ? "border-amber-200 bg-amber-50" : "border-zinc-200 bg-white"}`}>
          <p className={`text-xs ${saldo > 0.01 ? "text-amber-800" : "text-zinc-500"}`}>{saldo > 0.01 ? "Le debes" : factura ? "Pagada" : "Sin cuenta por pagar"}</p>
          <p className={`mt-1 text-2xl font-semibold ${saldo > 0.01 ? "text-amber-900" : "text-zinc-900"}`}>{formatoPesos(saldo > 0.01 ? saldo : pagado)}</p>
          <p className={`text-xs ${saldo > 0.01 ? "text-amber-700" : "text-zinc-400"}`}>
            {saldo > 0.01 && factura?.fecha_limite ? `vence ${formatoFecha(factura.fecha_limite)} · llevas ${formatoPesos(pagado)}` : factura ? `cuenta por pagar de ${formatoPesos(factura.monto)}` : ""}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-xs text-zinc-400">
              <th className="px-5 py-3 font-medium"></th>
              <th className="px-3 py-3 font-medium">Producto</th>
              <th className="px-3 py-3 text-right font-medium">Pedidas</th>
              <th className="px-3 py-3 text-right font-medium">Recibidas</th>
              <th className="px-3 py-3 text-right font-medium">Precio/pza</th>
              <th className="px-3 py-3 text-right font-medium">Importe</th>
              <th className="px-5 py-3 text-right font-medium">Costo al stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {lineas.map((l) => {
              const costo = costoUnitarioConFlete(l, lineas, orden.flete);
              const completa = l.cantidad_recibida >= l.cantidad;
              return (
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
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-900">{num(l.cantidad)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${completa ? "text-emerald-700" : l.cantidad_recibida > 0 ? "text-sky-700" : "text-zinc-400"}`}>
                    {num(l.cantidad_recibida)}
                    {l.cantidad_recibida > l.cantidad && <span className="block text-[10px] text-zinc-400">llegaron de más</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-700">{formatoPesos(l.precio_unitario)}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums text-zinc-900">{formatoPesos(l.cantidad * l.precio_unitario)}</td>
                  <td className="px-5 py-2 text-right text-xs tabular-nums text-zinc-400">
                    {formatoPesos(costo)}
                    {orden.flete > 0 && <span className="block text-[10px]">con flete</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-zinc-100 text-sm">
            <tr>
              <td colSpan={5} className="px-5 py-2 text-right text-zinc-500">Mercancía</td>
              <td className="px-3 py-2 text-right text-zinc-900">{formatoPesos(total - orden.flete)}</td>
              <td></td>
            </tr>
            {orden.flete > 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-2 text-right text-zinc-500">Flete u otros gastos</td>
                <td className="px-3 py-2 text-right text-zinc-900">{formatoPesos(orden.flete)}</td>
                <td></td>
              </tr>
            )}
            <tr className="font-semibold">
              <td colSpan={5} className="px-5 py-2 text-right text-zinc-900">Total (IVA {IVA_PCT}% incluido)</td>
              <td className="px-3 py-2 text-right text-zinc-900">{formatoPesos(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {abierta && <Recepcion ordenId={orden.id} lineas={lineas} bodegas={bodegas ?? []} bodegaId={orden.bodega_id} parcial={orden.estado === "PARCIAL"} />}

      {factura && <FacturaPagos ordenId={orden.id} factura={factura} pagos={pagos} cuentas={cuentas ?? []} saldo={saldo} condiciones={orden.condiciones_pago} />}

      {orden.estado !== "CANCELADA" && (
        <div className="flex justify-end">
          <AccionesOrden ordenId={orden.id} numero={orden.numero} tienePagos={pagos.length > 0} recibioAlgo={piezasRecibidas > 0} />
        </div>
      )}
    </div>
  );
}

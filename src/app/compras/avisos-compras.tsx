import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cargarOrdenes } from "@/lib/compras";
import { ordenesPorRecibir, pagosComprasPorVencer, textoEntrega } from "@/lib/calculos-compras";
import { fechaTextoMx } from "@/lib/fechas-mx";
import { formatoFecha, formatoPesos } from "@/lib/formato";

/** Avisos arriba de todas las pantallas de Compras: órdenes que ya debían
 * haber llegado y pagos a proveedores que vencen en 7 días o ya vencieron.
 * En `<Suspense>` dentro del layout para no detener la pantalla. */
export async function AvisosCompras() {
  const supabase = await createClient();
  const { ordenes, error } = await cargarOrdenes(supabase);
  if (error) return null;
  const hoy = fechaTextoMx(new Date());
  const atrasadas = ordenesPorRecibir(ordenes.map((o) => ({ ...o.orden, datos: o })), hoy).filter((o) => o.vencida);
  const pagosPorVencer = pagosComprasPorVencer(ordenes, 7);
  if (!atrasadas.length && !pagosPorVencer.length) return null;

  return (
    <>
      {atrasadas.length > 0 && (
        <div className="border-b border-amber-200 bg-amber-50 print:hidden">
          <div className="mx-auto max-w-5xl px-4 py-3 text-sm text-amber-900 sm:px-6">
            <p className="font-medium">{atrasadas.length === 1 ? "1 orden ya debía haber llegado:" : `${atrasadas.length} órdenes ya debían haber llegado:`}</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {atrasadas.slice(0, 5).map(({ orden, diasParaEntrega }) => (
                <li key={orden.id}>
                  <Link href={`/compras/${orden.id}`} className="font-medium underline-offset-2 hover:underline">
                    Orden #{orden.numero} · {orden.datos.proveedor?.nombre ?? "proveedor"}
                  </Link>{" "}
                  {textoEntrega(diasParaEntrega)} · si ya llegó, regístrala; si no, pregúntale al proveedor
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {pagosPorVencer.length > 0 && (
        <div className="border-b border-rose-200 bg-rose-50 print:hidden">
          <div className="mx-auto max-w-5xl px-4 py-3 text-sm text-rose-900 sm:px-6">
            <p className="font-medium">{pagosPorVencer.length === 1 ? "1 pago a proveedor vence pronto:" : `${pagosPorVencer.length} pagos a proveedores vencen pronto:`}</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {pagosPorVencer.slice(0, 5).map(({ datos: o, vencido }) => {
                return (
                  <li key={o.orden.id}>
                    <Link href={`/compras/${o.orden.id}`} className="font-medium underline-offset-2 hover:underline">
                      {o.proveedor?.nombre ?? "Proveedor"} · orden #{o.orden.numero}
                    </Link>{" "}
                    — <span className="font-medium">{formatoPesos(o.saldo)}</span>{" "}
                    {vencido ? <span className="font-medium text-red-700">ya venció</span> : <>vence {formatoFecha(o.factura!.fecha_limite!)}</>}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

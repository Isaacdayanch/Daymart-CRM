import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cargarOrdenes } from "@/lib/compras";
import { ordenesPorRecibir, textoEntrega } from "@/lib/calculos-compras";
import { fechaTextoMx } from "@/lib/fechas-mx";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { EstadoOrden } from "../estado-orden";

/** Lo que ya pediste y no ha llegado, la fecha de entrega más próxima
 * primero. Las atrasadas van en rojo. */
export default async function PorRecibir() {
  const supabase = await createClient();
  const { ordenes, error } = await cargarOrdenes(supabase);
  const hoy = fechaTextoMx(new Date());
  const lista = ordenesPorRecibir(ordenes.map((o) => ({ ...o.orden, datos: o })), hoy);
  const num = (n: number) => n.toLocaleString("es-MX");
  const piezas = lista.reduce((s, l) => s + Math.max(0, l.orden.datos.piezas - l.orden.datos.piezasRecibidas), 0);
  const atrasadas = lista.filter((l) => l.vencida).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Por recibir</h2>
        <p className="mt-1 text-sm text-zinc-500">Mercancía que ya pediste y todavía no entra a bodega. Cuando llegue, ábrela y registra cuánto llegó: entra al stock sola.</p>
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {lista.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs text-zinc-500">Órdenes en camino</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900">{lista.length}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs text-zinc-500">Piezas por llegar</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900">{num(piezas)}</p>
          </div>
          <div className={`rounded-2xl border p-5 shadow-sm ${atrasadas > 0 ? "border-red-200 bg-red-50" : "border-zinc-200 bg-white"}`}>
            <p className={`text-xs ${atrasadas > 0 ? "text-red-800" : "text-zinc-500"}`}>Atrasadas</p>
            <p className={`mt-1 text-2xl font-semibold ${atrasadas > 0 ? "text-red-900" : "text-zinc-900"}`}>{atrasadas}</p>
          </div>
        </div>
      )}
      {!error && lista.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <p className="text-base font-medium text-zinc-900">No hay nada en camino</p>
          <p className="mt-1 text-sm text-zinc-500">Todas tus órdenes ya se recibieron.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {lista.map(({ orden, vencida, diasParaEntrega }) => {
            const d = orden.datos;
            const pendientes = d.lineas.filter((l) => l.cantidad_recibida < l.cantidad);
            return (
              <li key={orden.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${vencida ? "border-red-200" : "border-zinc-200"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-3">
                      <Link href={`/compras/${orden.id}`} className="text-base font-semibold text-zinc-900 hover:underline">
                        Orden #{orden.numero} · {d.proveedor?.nombre ?? "Proveedor"}
                      </Link>
                      <EstadoOrden estado={orden.estado} vencida={vencida} />
                    </div>
                    <p className={`mt-1 text-sm ${vencida ? "font-medium text-red-700" : "text-zinc-500"}`}>
                      {textoEntrega(diasParaEntrega)}
                      {orden.fecha_entrega ? ` (${formatoFecha(orden.fecha_entrega)})` : ""} · pedida el {formatoFecha(orden.fecha)}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold text-zinc-900">{num(Math.max(0, d.piezas - d.piezasRecibidas))} pzas por llegar</p>
                    <p className="text-xs text-zinc-400">{formatoPesos(d.total)} en total</p>
                  </div>
                </div>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {pendientes.map((l) => (
                    <li key={l.id} className="flex items-center gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-700">
                      {l.imagen_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- miniatura chica
                        <img src={l.imagen_url} alt="" className="h-7 w-7 rounded object-cover" />
                      ) : (
                        <span className="h-7 w-7 rounded bg-zinc-200" />
                      )}
                      <span>
                        <span className="font-medium text-zinc-900">{num(l.cantidad - l.cantidad_recibida)}</span> × {l.nombre}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3">
                  <Link href={`/compras/${orden.id}#recibir`} className="text-sm font-medium text-[#2D3277] hover:underline">
                    Registrar llegada →
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

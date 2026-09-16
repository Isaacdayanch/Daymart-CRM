import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/servicio";
import { obtenerConexion } from "@/lib/mercadolibre-auth";
import { ESTADOS_ORDEN, obtenerEstadoSync, procesarNotificacionesPendientes, type OrdenItemMl, type OrdenMl } from "@/lib/mercadolibre-ordenes";
import { formatoFechaHoraMx, formatoFechaMx, inicioDelDiaMx, inicioDelMesMx } from "@/lib/fechas-mx";
import { formatoPesos } from "@/lib/formato";
import { BotonSincronizar } from "./boton-sincronizar";

const PERIODOS = [
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "7", etiqueta: "7 días" },
  { valor: "30", etiqueta: "30 días" },
  { valor: "mes", etiqueta: "Este mes" },
  { valor: "todo", etiqueta: "Todo" },
];

function desdePeriodo(periodo: string, ahora: Date): Date | null {
  if (periodo === "hoy") return inicioDelDiaMx(ahora);
  if (periodo === "mes") return inicioDelMesMx(ahora);
  if (periodo === "7") return new Date(inicioDelDiaMx(ahora).getTime() - 6 * 86400000);
  if (periodo === "30") return new Date(inicioDelDiaMx(ahora).getTime() - 29 * 86400000);
  return null;
}

function estiloEstado(estado: string | null) {
  if (estado === "paid") return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (estado === "cancelled" || estado === "invalid") return "bg-red-50 text-red-700 ring-red-600/20";
  return "bg-amber-50 text-amber-700 ring-amber-600/20";
}

export default async function VentasMercadoLibre({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { periodo: periodoCrudo } = await searchParams;
  const periodo = PERIODOS.some((p) => p.valor === periodoCrudo) ? periodoCrudo! : "30";
  const ahora = new Date();
  const desde = desdePeriodo(periodo, ahora);

  const conexion = await obtenerConexion().catch(() => null);
  let ordenes: OrdenMl[] = [];
  let items: OrdenItemMl[] = [];
  let sync = null;
  let errorLectura: string | null = null;
  try {
    // Si hay avisos del webhook sin atender, se procesan aquí mismo (rápido).
    if (conexion) await procesarNotificacionesPendientes(20).catch(() => 0);
    const supabase = createServiceClient();
    let consulta = supabase.from("mercadolibre_ordenes").select("*").order("fecha_creacion", { ascending: false }).limit(500);
    if (desde) consulta = consulta.gte("fecha_creacion", desde.toISOString());
    const { data, error } = await consulta.returns<OrdenMl[]>();
    if (error) throw new Error(error.message);
    ordenes = data ?? [];
    if (ordenes.length) {
      const { data: dataItems } = await supabase
        .from("mercadolibre_orden_items")
        .select("*")
        .in("orden_id", ordenes.map((o) => o.id))
        .returns<OrdenItemMl[]>();
      items = dataItems ?? [];
    }
    sync = await obtenerEstadoSync();
  } catch (e) {
    errorLectura = e instanceof Error ? e.message : "No se pudieron leer las ventas.";
  }

  const itemsDe = (ordenId: number) => items.filter((i) => i.orden_id === ordenId);
  const validas = ordenes.filter((o) => o.estado === "paid");
  const piezas = validas.reduce((s, o) => s + itemsDe(o.id).reduce((a, i) => a + i.cantidad, 0), 0);
  const totalVendido = validas.reduce((s, o) => s + o.total, 0);
  const comisiones = validas.reduce((s, o) => s + o.comision, 0);
  const envios = validas.reduce((s, o) => s + (o.costo_envio_vendedor ?? 0), 0);
  const neto = totalVendido - comisiones - envios;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex overflow-hidden rounded-lg border border-zinc-300 text-xs">
          {PERIODOS.map((p) => (
            <Link
              key={p.valor}
              href={`/mercadolibre/ventas?periodo=${p.valor}`}
              className={`px-3 py-1.5 ${periodo === p.valor ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:text-zinc-900"}`}
            >
              {p.etiqueta}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {sync?.ultima_sync && (
            <p className="text-xs text-zinc-400">
              Última sincronización: {formatoFechaHoraMx(sync.ultima_sync)} · {sync.ordenes_total} órdenes guardadas
            </p>
          )}
          <BotonSincronizar conectado={Boolean(conexion)} primeraVez={!sync?.ultima_sync} />
        </div>
      </div>

      {!conexion && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Mercado Libre no está conectado. Ve a la pestaña <Link href="/mercadolibre" className="underline">Conexión</Link>.
        </div>
      )}
      {errorLectura && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorLectura} — si dice que falta una tabla, corre el SQL 0030 en Supabase.
        </div>
      )}
      {sync?.ultimo_error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          La última sincronización falló: {sync.ultimo_error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-5">
        <Tarjeta titulo="Ventas pagadas" valor={String(validas.length)} sub={`${piezas.toLocaleString("es-MX")} piezas`} />
        <Tarjeta titulo="Total vendido" valor={formatoPesos(totalVendido)} />
        <Tarjeta titulo="Comisiones ML" valor={formatoPesos(comisiones)} tono="rojo" />
        <Tarjeta titulo="Envíos (a tu cargo)" valor={formatoPesos(envios)} tono="rojo" />
        <Tarjeta titulo="Te queda" valor={formatoPesos(neto)} tono="verde" sub="antes de tu costo de producto" />
      </div>

      {ordenes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <p className="text-base font-medium text-zinc-900">No hay ventas en este periodo</p>
          <p className="mt-1 text-sm text-zinc-500">
            {sync?.ultima_sync ? "Prueba con otro periodo o sincroniza de nuevo." : "Dale a “Sincronizar” para traer tus ventas de Mercado Libre."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-xs text-zinc-400">
                <th className="px-5 py-3 font-medium">Fecha (CDMX)</th>
                <th className="px-3 py-3 font-medium">Productos</th>
                <th className="px-3 py-3 font-medium">Comprador</th>
                <th className="px-3 py-3 text-right font-medium">Total</th>
                <th className="px-3 py-3 text-right font-medium">Comisión</th>
                <th className="px-3 py-3 text-right font-medium">Envío</th>
                <th className="px-3 py-3 font-medium">Logística</th>
                <th className="px-5 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {ordenes.map((o) => (
                <tr key={o.id} className="align-top">
                  <td className="px-5 py-3 whitespace-nowrap">
                    <p className="text-zinc-900">{formatoFechaMx(o.fecha_creacion)}</p>
                    <p className="text-xs text-zinc-400">{formatoFechaHoraMx(o.fecha_creacion).split(",").pop()?.trim()} · #{o.id}</p>
                  </td>
                  <td className="px-3 py-3">
                    <ul className="space-y-1.5">
                      {itemsDe(o.id).map((i) => (
                        <li key={i.id} className="flex items-center gap-2">
                          {i.imagen_url ? (
                            // eslint-disable-next-line @next/next/no-img-element -- miniatura de Mercado Libre
                            <img src={i.imagen_url} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
                          ) : (
                            <div className="h-8 w-8 shrink-0 rounded-md bg-zinc-100" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-zinc-900" title={i.titulo ?? ""}>
                              <span className="font-semibold">{i.cantidad}×</span> {i.titulo}
                            </p>
                            <p className="text-xs text-zinc-400">
                              {formatoPesos(i.precio_unitario)} c/u{i.seller_sku ? ` · SKU ${i.seller_sku}` : ""}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-3 py-3 text-zinc-600">{o.comprador_nickname ?? o.comprador_nombre ?? "—"}</td>
                  <td className="px-3 py-3 text-right font-medium text-zinc-900">{formatoPesos(o.total)}</td>
                  <td className="px-3 py-3 text-right text-red-600">{o.comision ? `-${formatoPesos(o.comision)}` : "—"}</td>
                  <td className="px-3 py-3 text-right text-red-600">
                    {o.costo_envio_vendedor !== null ? (o.costo_envio_vendedor ? `-${formatoPesos(o.costo_envio_vendedor)}` : "$0") : <span className="text-zinc-300">…</span>}
                  </td>
                  <td className="px-3 py-3 text-xs text-zinc-600">{o.logistica ?? "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${estiloEstado(o.estado)}`}>
                      {ESTADOS_ORDEN[o.estado ?? ""] ?? o.estado ?? "?"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-zinc-400">
        Las comisiones y envíos son los que reporta Mercado Libre en cada orden. Los envíos aparecen con “…” hasta que
        Mercado Libre publica su costo (normalmente al despachar). Las cifras de arriba solo suman ventas pagadas.
      </p>
    </div>
  );
}

function Tarjeta({ titulo, valor, sub, tono }: { titulo: string; valor: string; sub?: string; tono?: "rojo" | "verde" }) {
  const color = tono === "rojo" ? "text-red-700" : tono === "verde" ? "text-emerald-700" : "text-zinc-900";
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-zinc-500">{titulo}</p>
      <p className={`mt-1 text-xl font-semibold ${color}`}>{valor}</p>
      {sub && <p className="text-[11px] text-zinc-400">{sub}</p>}
    </div>
  );
}

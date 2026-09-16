import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/servicio";
import { obtenerConexion } from "@/lib/mercadolibre-auth";
import {
  ESTADOS_ORDEN,
  obtenerEstadoSync,
  procesarNotificacionesPendientes,
  sincronizarOrdenes,
  type OrdenItemMl,
  type OrdenMl,
} from "@/lib/mercadolibre-ordenes";
import {
  fechaTextoMx,
  formatoFechaHoraMx,
  formatoFechaMx,
  formatoHoraMx,
  inicioDelDiaMx,
  inicioDelMesMx,
  inicioDeSemanaMx,
  instanteDesdeFechaMx,
} from "@/lib/fechas-mx";
import { formatoPesos } from "@/lib/formato";
import { BotonSincronizar } from "./boton-sincronizar";
import { FiltroFechas } from "./filtro-fechas";

const DIA_MS = 86400000;
// Si la última sincronización tiene más de 10 minutos, se refrescan las
// ventas de los últimos 2 días al abrir la pantalla (rápido) — así las
// ventas nuevas aparecen sin tener que picarle a "Sincronizar".
const AUTO_SYNC_MS = 10 * 60 * 1000;

function estiloEstado(estado: string | null) {
  if (estado === "paid") return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (estado === "cancelled" || estado === "invalid") return "bg-red-50 text-red-700 ring-red-600/20";
  return "bg-amber-50 text-amber-700 ring-amber-600/20";
}

export default async function VentasMercadoLibre({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }>;
}) {
  const params = await searchParams;
  const ahora = new Date();
  const hoyTexto = fechaTextoMx(ahora);

  // Rango del filtro, en fechas de Ciudad de México. `hasta` es exclusivo
  // (las 00:00 del día siguiente) para incluir el día completo.
  let periodo = "hoy";
  let desde: Date;
  let hasta: Date;
  const esFecha = (t?: string) => Boolean(t && /^\d{4}-\d{2}-\d{2}$/.test(t));
  if (esFecha(params.desde) && esFecha(params.hasta)) {
    periodo = "personalizado";
    desde = instanteDesdeFechaMx(params.desde!);
    hasta = new Date(instanteDesdeFechaMx(params.hasta!).getTime() + DIA_MS);
  } else if (params.periodo === "semana") {
    periodo = "semana";
    desde = inicioDeSemanaMx(ahora);
    hasta = new Date(inicioDelDiaMx(ahora).getTime() + DIA_MS);
  } else if (params.periodo === "mes") {
    periodo = "mes";
    desde = inicioDelMesMx(ahora);
    hasta = new Date(inicioDelDiaMx(ahora).getTime() + DIA_MS);
  } else {
    desde = inicioDelDiaMx(ahora);
    hasta = new Date(desde.getTime() + DIA_MS);
  }
  const desdeTexto = fechaTextoMx(desde);
  const hastaTexto = fechaTextoMx(new Date(hasta.getTime() - 1));

  const conexion = await obtenerConexion().catch(() => null);
  let ordenes: OrdenMl[] = [];
  let items: OrdenItemMl[] = [];
  let sync = null;
  let errorLectura: string | null = null;
  try {
    sync = await obtenerEstadoSync();
    if (conexion) {
      await procesarNotificacionesPendientes(20).catch(() => 0);
      const vieja = !sync?.ultima_sync || ahora.getTime() - new Date(sync.ultima_sync).getTime() > AUTO_SYNC_MS;
      if (sync?.ultima_sync && vieja) {
        await sincronizarOrdenes({ diasAtras: 2 }).catch(() => 0);
        sync = await obtenerEstadoSync();
      }
    }
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("mercadolibre_ordenes")
      .select("*")
      .gte("fecha_creacion", desde.toISOString())
      .lt("fecha_creacion", hasta.toISOString())
      .order("fecha_creacion", { ascending: false })
      .limit(1000)
      .returns<OrdenMl[]>();
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
  } catch (e) {
    errorLectura = e instanceof Error ? e.message : "No se pudieron leer las ventas.";
  }

  const itemsDe = (ordenId: number) => items.filter((i) => i.orden_id === ordenId);
  const pagadas = ordenes.filter((o) => o.estado === "paid");
  const canceladas = ordenes.filter((o) => o.estado === "cancelled" || o.estado === "invalid");
  const pendientes = ordenes.filter((o) => !pagadas.includes(o) && !canceladas.includes(o));
  const piezas = pagadas.reduce((s, o) => s + itemsDe(o.id).reduce((a, i) => a + i.cantidad, 0), 0);
  const totalVendido = pagadas.reduce((s, o) => s + o.total, 0);
  const comisiones = pagadas.reduce((s, o) => s + o.comision, 0);
  const envios = pagadas.reduce((s, o) => s + (o.costo_envio_vendedor ?? 0), 0);
  const neto = totalVendido - comisiones - envios;
  // Un carrito (varias órdenes con el mismo pack_id) Mercado Libre lo cuenta
  // como UNA venta en su panel — aquí se muestran ambas cifras.
  const paquetes = new Set(pagadas.map((o) => o.pack_id ?? o.id)).size;

  const tituloPeriodo =
    periodo === "hoy"
      ? `Hoy, ${formatoFechaMx(ahora.toISOString())}`
      : periodo === "semana"
        ? `Esta semana (desde el lunes ${formatoFechaMx(desde.toISOString())})`
        : periodo === "mes"
          ? `Este mes (desde el ${formatoFechaMx(desde.toISOString())})`
          : desdeTexto === hastaTexto
            ? formatoFechaMx(desde.toISOString())
            : `Del ${formatoFechaMx(desde.toISOString())} al ${formatoFechaMx(new Date(hasta.getTime() - 1).toISOString())}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-zinc-900">{tituloPeriodo}</h2>
          <FiltroFechas periodo={periodo} desde={desdeTexto} hasta={hastaTexto} hoyTexto={hoyTexto} />
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <BotonSincronizar conectado={Boolean(conexion)} primeraVez={!sync?.ultima_sync} />
          <p className="text-[11px] text-zinc-400">
            {conexion ? (
              <>
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" />
                Conectado como <span className="font-medium text-zinc-600">{conexion.nickname ?? conexion.ml_user_id}</span>
              </>
            ) : (
              <>
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-zinc-300 align-middle" />
                Sin conectar
              </>
            )}
            {" · "}
            <Link href="/mercadolibre/conexion" className="hover:text-zinc-900 hover:underline">
              conexión
            </Link>
            {sync?.ultima_sync && <> · actualizado {formatoHoraMx(sync.ultima_sync)}</>}
          </p>
        </div>
      </div>

      {!conexion && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Mercado Libre no está conectado. Ve a <Link href="/mercadolibre/conexion" className="underline">Conexión</Link> y dale a
          “Conectar mi cuenta”.
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
        <Tarjeta
          titulo="Ventas pagadas"
          valor={String(pagadas.length)}
          sub={
            paquetes !== pagadas.length
              ? `${paquetes} ${paquetes === 1 ? "compra" : "compras"} (hay carritos) · ${piezas.toLocaleString("es-MX")} piezas`
              : `${piezas.toLocaleString("es-MX")} piezas`
          }
        />
        <Tarjeta titulo="Total vendido" valor={formatoPesos(totalVendido)} />
        <Tarjeta titulo="Comisiones ML" valor={formatoPesos(comisiones)} tono="rojo" />
        <Tarjeta titulo="Envíos (a tu cargo)" valor={formatoPesos(envios)} tono="rojo" />
        <Tarjeta titulo="Te queda" valor={formatoPesos(neto)} tono="verde" sub="antes de tu costo de producto" />
      </div>

      {(pendientes.length > 0 || canceladas.length > 0) && (
        <p className="text-xs text-zinc-500">
          Además en este periodo:
          {pendientes.length > 0 && (
            <>
              {" "}
              <span className="font-medium text-amber-700">
                {pendientes.length} {pendientes.length === 1 ? "orden pendiente de pago" : "órdenes pendientes de pago"}
              </span>
            </>
          )}
          {pendientes.length > 0 && canceladas.length > 0 && " y"}
          {canceladas.length > 0 && (
            <>
              {" "}
              <span className="font-medium text-red-700">
                {canceladas.length} {canceladas.length === 1 ? "cancelada" : "canceladas"}
              </span>
            </>
          )}
          . No entran en los totales de arriba.
        </p>
      )}

      {ordenes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <p className="text-base font-medium text-zinc-900">No hay ventas en este periodo</p>
          <p className="mt-1 text-sm text-zinc-500">
            {sync?.ultima_sync ? "Prueba con otras fechas o sincroniza de nuevo." : "Dale a “Traer mis ventas” para traer tus ventas de Mercado Libre."}
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
                    <p className="text-zinc-900">
                      {formatoFechaMx(o.fecha_creacion)} <span className="text-zinc-500">{formatoHoraMx(o.fecha_creacion)}</span>
                    </p>
                    <p className="text-xs text-zinc-400">
                      #{o.id}
                      {o.pack_id && <span title="Parte de un carrito"> · carrito</span>}
                    </p>
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
        Mercado Libre publica su costo (normalmente al despachar). Los totales de arriba solo suman ventas pagadas.
        {sync?.ultima_sync && <> Última sincronización completa: {formatoFechaHoraMx(sync.ultima_sync)}.</>}
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

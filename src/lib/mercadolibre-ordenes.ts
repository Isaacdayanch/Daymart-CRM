// Sincronización de las ventas (órdenes) de Mercado Libre hacia nuestra
// copia local. Solo lectura desde Mercado Libre: nunca modifica nada allá.

import { createServiceClient } from "@/lib/supabase/servicio";
import { mercadolibreGet, obtenerConexion } from "@/lib/mercadolibre-auth";

export interface OrdenMl {
  id: number;
  pack_id: number | null;
  estado: string | null;
  estado_detalle: string | null;
  fecha_creacion: string;
  fecha_cierre: string | null;
  ultima_actualizacion: string | null;
  comprador_id: number | null;
  comprador_nickname: string | null;
  comprador_nombre: string | null;
  total: number;
  monto_pagado: number;
  moneda: string | null;
  comision: number;
  envio_id: number | null;
  logistica: string | null;
  envio_estado: string | null;
  costo_envio_vendedor: number | null;
  etiquetas: string[] | null;
  sincronizado_en: string;
}

export interface OrdenItemMl {
  id: string;
  orden_id: number;
  item_id: string | null;
  variation_id: number | null;
  titulo: string | null;
  seller_sku: string | null;
  categoria_id: string | null;
  cantidad: number;
  precio_unitario: number;
  sale_fee: number;
  listing_type: string | null;
  imagen_url: string | null;
}

export interface EstadoSync {
  id: number;
  ultima_sync: string | null;
  ultimo_error: string | null;
  ordenes_total: number;
}

// ---- Forma de los datos que regresa Mercado Libre (solo lo que usamos) ----

interface OrdenApi {
  id: number;
  pack_id?: number | null;
  status?: string;
  status_detail?: string | null;
  date_created: string;
  date_closed?: string | null;
  last_updated?: string | null;
  total_amount?: number;
  paid_amount?: number;
  currency_id?: string;
  buyer?: { id?: number; nickname?: string; first_name?: string; last_name?: string };
  shipping?: { id?: number | null };
  tags?: string[];
  order_items?: {
    item?: { id?: string; title?: string; category_id?: string; variation_id?: number | null; seller_sku?: string | null; seller_custom_field?: string | null };
    quantity?: number;
    unit_price?: number;
    sale_fee?: number;
    listing_type_id?: string;
  }[];
}

const LOGISTICA: Record<string, string> = {
  fulfillment: "Full",
  cross_docking: "Colecta",
  drop_off: "Punto de envío",
  xd_drop_off: "Colecta en agencia",
  self_service: "Flex",
  custom: "Acordado",
  not_specified: "Sin especificar",
};

export const ESTADOS_ORDEN: Record<string, string> = {
  paid: "Pagada",
  confirmed: "Confirmada",
  payment_required: "Pago pendiente",
  payment_in_process: "Pago en proceso",
  partially_paid: "Pago parcial",
  cancelled: "Cancelada",
  invalid: "Inválida",
};

/** Comisión total de la orden: Mercado Libre reporta `sale_fee` por unidad
 * en cada renglón, así que se multiplica por la cantidad. (Pendiente de
 * confirmar contra el reporte de ventas de Isaac en la primera revisión.) */
function comisionOrden(orden: OrdenApi) {
  return (orden.order_items ?? []).reduce((s, i) => s + (i.sale_fee ?? 0) * (i.quantity ?? 0), 0);
}

const cacheImagenes = new Map<string, string | null>();

async function imagenDeItem(itemId: string | undefined) {
  if (!itemId) return null;
  if (cacheImagenes.has(itemId)) return cacheImagenes.get(itemId) ?? null;
  try {
    const item = await mercadolibreGet<{ thumbnail?: string; pictures?: { secure_url?: string; url?: string }[] }>(
      `/items/${itemId}?attributes=thumbnail,pictures`,
    );
    const url = item.pictures?.[0]?.secure_url ?? item.pictures?.[0]?.url ?? item.thumbnail ?? null;
    cacheImagenes.set(itemId, url);
    return url;
  } catch {
    cacheImagenes.set(itemId, null);
    return null;
  }
}

async function datosEnvio(envioId: number) {
  let logistica: string | null = null;
  let estado: string | null = null;
  let costoVendedor: number | null = null;
  try {
    const envio = await mercadolibreGet<{ logistic_type?: string; status?: string }>(`/shipments/${envioId}`);
    logistica = envio.logistic_type ? (LOGISTICA[envio.logistic_type] ?? envio.logistic_type) : null;
    estado = envio.status ?? null;
  } catch {
    // sin datos de envío: se deja en null
  }
  try {
    const costos = await mercadolibreGet<{ senders?: { cost?: number }[]; gross_amount?: number }>(`/shipments/${envioId}/costs`);
    costoVendedor = costos.senders?.reduce((s, x) => s + (x.cost ?? 0), 0) ?? null;
  } catch {
    // Mercado Libre no siempre tiene costos todavía (ej. envío no despachado)
  }
  return { logistica, estado, costoVendedor };
}

/** Guarda (o actualiza) una orden y sus productos. `conEnvio` pide también
 * los datos de envío — cuesta 2 llamadas extra por orden, así que en la
 * sincronización masiva solo se hace para las órdenes que no lo tienen. */
export async function guardarOrden(orden: OrdenApi, conEnvio: boolean) {
  const supabase = createServiceClient();

  let envio = { logistica: null as string | null, estado: null as string | null, costoVendedor: null as number | null };
  if (conEnvio && orden.shipping?.id) envio = await datosEnvio(orden.shipping.id);

  const fila: Record<string, unknown> = {
    id: orden.id,
    pack_id: orden.pack_id ?? null,
    estado: orden.status ?? null,
    estado_detalle: orden.status_detail ?? null,
    fecha_creacion: orden.date_created,
    fecha_cierre: orden.date_closed ?? null,
    ultima_actualizacion: orden.last_updated ?? null,
    comprador_id: orden.buyer?.id ?? null,
    comprador_nickname: orden.buyer?.nickname ?? null,
    comprador_nombre: [orden.buyer?.first_name, orden.buyer?.last_name].filter(Boolean).join(" ") || null,
    total: orden.total_amount ?? 0,
    monto_pagado: orden.paid_amount ?? 0,
    moneda: orden.currency_id ?? null,
    comision: comisionOrden(orden),
    envio_id: orden.shipping?.id ?? null,
    etiquetas: orden.tags ?? null,
    payload: orden,
    sincronizado_en: new Date().toISOString(),
  };
  if (conEnvio) {
    fila.logistica = envio.logistica;
    fila.envio_estado = envio.estado;
    fila.costo_envio_vendedor = envio.costoVendedor;
  }

  const { error } = await supabase.from("mercadolibre_ordenes").upsert(fila);
  if (error) throw new Error(`No se pudo guardar la orden ${orden.id}: ${error.message}`);

  const items = [];
  for (const i of orden.order_items ?? []) {
    items.push({
      orden_id: orden.id,
      item_id: i.item?.id ?? null,
      variation_id: i.item?.variation_id ?? null,
      titulo: i.item?.title ?? null,
      seller_sku: i.item?.seller_sku ?? i.item?.seller_custom_field ?? null,
      categoria_id: i.item?.category_id ?? null,
      cantidad: i.quantity ?? 0,
      precio_unitario: i.unit_price ?? 0,
      sale_fee: i.sale_fee ?? 0,
      listing_type: i.listing_type_id ?? null,
      imagen_url: await imagenDeItem(i.item?.id),
    });
  }
  await supabase.from("mercadolibre_orden_items").delete().eq("orden_id", orden.id);
  if (items.length) {
    const { error: errorItems } = await supabase.from("mercadolibre_orden_items").insert(items);
    if (errorItems) throw new Error(`No se pudieron guardar los productos de la orden ${orden.id}: ${errorItems.message}`);
  }
}

export async function obtenerEstadoSync(): Promise<EstadoSync | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("mercadolibre_sync").select("*").eq("id", 1).maybeSingle<EstadoSync>();
  return data ?? null;
}

/** Trae de Mercado Libre todas las órdenes creadas desde `desde` (o desde
 * la última sincronización menos 3 días, o 60 días si es la primera vez)
 * y las guarda. Regresa cuántas se guardaron. */
export async function sincronizarOrdenes(opciones: { diasAtras?: number } = {}) {
  const conexion = await obtenerConexion();
  if (!conexion) throw new Error("Mercado Libre no está conectado.");
  const supabase = createServiceClient();
  const estado = await obtenerEstadoSync();

  let desde: Date;
  if (opciones.diasAtras) desde = new Date(Date.now() - opciones.diasAtras * 86400000);
  else if (estado?.ultima_sync) desde = new Date(new Date(estado.ultima_sync).getTime() - 3 * 86400000);
  else desde = new Date(Date.now() - 60 * 86400000);

  // Qué órdenes ya tienen datos de envío (para no volver a pedirlos).
  const { data: existentes } = await supabase
    .from("mercadolibre_ordenes")
    .select("id, costo_envio_vendedor, logistica")
    .returns<{ id: number; costo_envio_vendedor: number | null; logistica: string | null }[]>();
  const conEnvioListo = new Set((existentes ?? []).filter((o) => o.costo_envio_vendedor !== null && o.logistica).map((o) => o.id));

  let guardadas = 0;
  let consultasEnvio = 0;
  const LIMITE_ENVIOS_POR_SYNC = 120;
  try {
    for (let offset = 0; offset < 5000; offset += 50) {
      const params = new URLSearchParams({
        seller: String(conexion.ml_user_id),
        "order.date_created.from": desde.toISOString(),
        sort: "date_desc",
        limit: "50",
        offset: String(offset),
      });
      const pagina = await mercadolibreGet<{ results: OrdenApi[]; paging?: { total?: number } }>(`/orders/search?${params}`);
      const resultados = pagina.results ?? [];
      for (const orden of resultados) {
        const pedirEnvio = !conEnvioListo.has(orden.id) && consultasEnvio < LIMITE_ENVIOS_POR_SYNC;
        if (pedirEnvio) consultasEnvio++;
        await guardarOrden(orden, pedirEnvio);
        guardadas++;
      }
      if (resultados.length < 50) break;
      if (pagina.paging?.total !== undefined && offset + 50 >= pagina.paging.total) break;
    }
    const { count } = await supabase.from("mercadolibre_ordenes").select("id", { count: "exact", head: true });
    await supabase.from("mercadolibre_sync").upsert({
      id: 1,
      ultima_sync: new Date().toISOString(),
      ultimo_error: null,
      ordenes_total: count ?? 0,
    });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error desconocido";
    await supabase.from("mercadolibre_sync").upsert({ id: 1, ultimo_error: mensaje });
    throw e;
  }
  return guardadas;
}

/** Procesa los avisos del webhook que todavía no se han atendido: por cada
 * aviso de orden, jala esa orden completa; por cada aviso de envío,
 * refresca su costo/logística. */
export async function procesarNotificacionesPendientes(limite = 30) {
  const supabase = createServiceClient();
  const { data: pendientes } = await supabase
    .from("mercadolibre_notificaciones")
    .select("id, topic, resource")
    .is("procesado_en", null)
    .order("recibido_en", { ascending: true })
    .limit(limite)
    .returns<{ id: string; topic: string | null; resource: string | null }[]>();
  if (!pendientes?.length) return 0;

  const conexion = await obtenerConexion();
  let procesadas = 0;
  for (const n of pendientes) {
    try {
      if (conexion && n.topic === "orders_v2" && n.resource?.startsWith("/orders/")) {
        const orden = await mercadolibreGet<OrdenApi>(n.resource);
        await guardarOrden(orden, true);
      } else if (conexion && n.topic === "shipments" && n.resource?.startsWith("/shipments/")) {
        const envioId = Number(n.resource.split("/")[2]);
        if (envioId) {
          const envio = await datosEnvio(envioId);
          await supabase
            .from("mercadolibre_ordenes")
            .update({ logistica: envio.logistica, envio_estado: envio.estado, costo_envio_vendedor: envio.costoVendedor })
            .eq("envio_id", envioId);
        }
      }
      // items y otros tópicos: por ahora solo se marcan como vistos.
      await supabase.from("mercadolibre_notificaciones").update({ procesado_en: new Date().toISOString() }).eq("id", n.id);
      procesadas++;
    } catch {
      // se deja pendiente para el siguiente intento
    }
  }
  return procesadas;
}

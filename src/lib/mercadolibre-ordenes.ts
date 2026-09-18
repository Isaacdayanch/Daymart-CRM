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
  /** Salidas automáticas de stock (migración 0035). */
  salida_generada_en?: string | null;
  devolucion_estado?: "POR_CONFIRMAR" | "REINGRESADA" | "MERMA" | null;
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
  /** Texto de la variante ("Color: Negro · Talla: M") o null si no tiene. */
  variacion: string | null;
  /** Comisión verificada de este renglón (null en filas guardadas antes de la migración 0031). */
  comision: number | null;
}

export interface EstadoSync {
  id: number;
  ultima_sync: string | null;
  ultimo_error: string | null;
  ordenes_total: number;
  /** Publicaciones/stock (migración 0032). */
  ultima_sync_stock?: string | null;
  ultimo_error_stock?: string | null;
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
    item?: {
      id?: string;
      title?: string;
      category_id?: string;
      variation_id?: number | null;
      seller_sku?: string | null;
      seller_custom_field?: string | null;
      variation_attributes?: { name?: string; value_name?: string }[];
    };
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

/** Comisión de un renglón. Mercado Libre reporta `sale_fee` por unidad, pero
 * como Isaac no tiene forma de comprobarlo a mano, para renglones de más de
 * una pieza se verifica contra la tarifa oficial (`listing_prices`) de ese
 * precio/categoría: si `sale_fee` se parece a la tarifa de UNA pieza, se
 * multiplica por la cantidad; si ya se parece a la tarifa × cantidad, se
 * deja tal cual. Así la comisión queda bien en cualquiera de los dos casos. */
const cacheTarifa = new Map<string, number | null>();

async function tarifaUnitaria(precio: number, categoriaId: string | undefined, listingType: string | undefined) {
  if (!categoriaId || !precio) return null;
  const clave = `${categoriaId}|${precio}|${listingType ?? ""}`;
  if (cacheTarifa.has(clave)) return cacheTarifa.get(clave) ?? null;
  try {
    const params = new URLSearchParams({ price: String(precio), category_id: categoriaId });
    if (listingType) params.set("listing_type_id", listingType);
    const r = await mercadolibreGet<{ sale_fee_amount?: number }[] | { sale_fee_amount?: number }>(`/sites/MLM/listing_prices?${params}`);
    const uno = Array.isArray(r) ? r[0] : r;
    const monto = typeof uno?.sale_fee_amount === "number" ? uno.sale_fee_amount : null;
    cacheTarifa.set(clave, monto);
    return monto;
  } catch {
    cacheTarifa.set(clave, null);
    return null;
  }
}

async function comisionRenglon(i: NonNullable<OrdenApi["order_items"]>[number]) {
  const fee = i.sale_fee ?? 0;
  const cantidad = i.quantity ?? 0;
  if (!fee || cantidad <= 1) return fee;
  const unitaria = await tarifaUnitaria(i.unit_price ?? 0, i.item?.category_id, i.listing_type_id);
  if (unitaria) {
    const cerca = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, b * 0.15);
    if (cerca(fee, unitaria * cantidad)) return fee; // ya venía por renglón
    if (cerca(fee, unitaria)) return fee * cantidad; // venía por unidad
  }
  return fee * cantidad; // regla por defecto: por unidad
}

/** Comisión por renglón (en el mismo orden que `order_items`). */
async function comisionesPorRenglon(orden: OrdenApi) {
  const lista: number[] = [];
  for (const i of orden.order_items ?? []) lista.push(await comisionRenglon(i));
  return lista;
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

  const comisiones = await comisionesPorRenglon(orden);
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
    comision: comisiones.reduce((a, b) => a + b, 0),
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
  for (const [indice, i] of (orden.order_items ?? []).entries()) {
    items.push({
      comision: comisiones[indice] ?? 0,
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
      variacion:
        (i.item?.variation_attributes ?? [])
          .map((a) => [a.name, a.value_name].filter(Boolean).join(": "))
          .filter(Boolean)
          .join(" · ") || null,
    });
  }
  await supabase.from("mercadolibre_orden_items").delete().eq("orden_id", orden.id);
  if (items.length) {
    let { error: errorItems } = await supabase.from("mercadolibre_orden_items").insert(items);
    if (errorItems && /variacion|comision/.test(errorItems.message)) {
      // Todavía no se corre la migración 0031: se guarda sin esas columnas.
      ({ error: errorItems } = await supabase
        .from("mercadolibre_orden_items")
        .insert(
          items.map((fila) => {
            const copia: Record<string, unknown> = { ...fila };
            delete copia.variacion;
            delete copia.comision;
            return copia;
          }),
        ));
    }
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
export interface ResultadoPaginaOrdenes {
  guardadas: number;
  /** Offset de la siguiente página, o null si ya no hay más. */
  siguiente: number | null;
  /** Total de órdenes del rango completo (solo se conoce en la primera ventana). */
  total: number | null;
  desdeIso: string;
  /** Tope de fecha de la ventana actual (ver LIMITE_OFFSET_ML). */
  hastaIso?: string;
}

/** Mercado Libre no deja pedir más allá de la orden 10,000 de una búsqueda
 * ("Limit must be a lower or equal than 10000"). Cuando una descarga larga
 * llega ahí, se cierra la ventana de fechas por arriba (tope = fecha de la
 * orden más vieja que ya se trajo) y se vuelve a empezar desde offset 0 —
 * así se puede bajar cualquier cantidad de ventas en ventanas de 10,000. */
const LIMITE_OFFSET_ML = 10000;
const TAMANO_PAGINA = 50;

function unSegundoDespues(iso: string) {
  return new Date(new Date(iso).getTime() + 1000).toISOString();
}

async function enGrupos<T>(lista: T[], tamano: number, fn: (x: T) => Promise<void>) {
  for (let i = 0; i < lista.length; i += tamano) {
    await Promise.all(lista.slice(i, i + tamano).map(fn));
  }
}

/** Sincroniza UNA página (50 órdenes) a partir de `offset`. Se llama en
 * tandas desde la pantalla para que ninguna llamada dure más de lo que
 * Vercel permite. `desdeIso` fija el rango en la primera llamada y se
 * reutiliza en las siguientes para que la paginación sea consistente. */
export async function sincronizarPaginaOrdenes(opciones: {
  diasAtras?: number;
  offset?: number;
  desdeIso?: string;
  hastaIso?: string;
}): Promise<ResultadoPaginaOrdenes> {
  const conexion = await obtenerConexion();
  if (!conexion) throw new Error("Mercado Libre no está conectado.");
  const supabase = createServiceClient();
  let offset = opciones.offset ?? 0;
  let hastaIso = opciones.hastaIso;

  let desdeIso = opciones.desdeIso;
  if (!desdeIso) {
    const estado = await obtenerEstadoSync();
    let desde: Date;
    if (opciones.diasAtras) desde = new Date(Date.now() - opciones.diasAtras * 86400000);
    else if (estado?.ultima_sync) desde = new Date(new Date(estado.ultima_sync).getTime() - 3 * 86400000);
    else desde = new Date(Date.now() - 60 * 86400000);
    desdeIso = desde.toISOString();
  }

  // Un avance guardado de antes de este arreglo puede traer offset 10,000 sin
  // tope de fecha: se recupera el tope de lo que ya está en la base (la orden
  // más vieja guardada dentro del rango) para no volver a tronar.
  if (!hastaIso && offset + TAMANO_PAGINA > LIMITE_OFFSET_ML) {
    const { data: masVieja } = await supabase
      .from("mercadolibre_ordenes")
      .select("fecha_creacion")
      .gte("fecha_creacion", desdeIso)
      .order("fecha_creacion", { ascending: true })
      .limit(1)
      .maybeSingle<{ fecha_creacion: string }>();
    if (!masVieja) throw new Error("No se pudo continuar la descarga; vuelve a empezarla con 'Traer último año'.");
    hastaIso = unSegundoDespues(masVieja.fecha_creacion);
    offset = 0;
  }

  try {
    const params = new URLSearchParams({
      seller: String(conexion.ml_user_id),
      "order.date_created.from": desdeIso,
      sort: "date_desc",
      limit: String(TAMANO_PAGINA),
      offset: String(offset),
    });
    if (hastaIso) params.set("order.date_created.to", hastaIso);
    const pagina = await mercadolibreGet<{ results: OrdenApi[]; paging?: { total?: number } }>(`/orders/search?${params}`);
    const resultados = pagina.results ?? [];

    // Qué órdenes de esta página ya están guardadas: si no cambiaron en ML
    // desde entonces (misma "última actualización") y ya tienen su costo de
    // envío, se saltan por completo — así repetir una descarga es rápido.
    const ids = resultados.map((o) => o.id);
    const { data: existentes } = ids.length
      ? await supabase
          .from("mercadolibre_ordenes")
          .select("id, costo_envio_vendedor, logistica, ultima_actualizacion, comision")
          .in("id", ids)
          .returns<{ id: number; costo_envio_vendedor: number | null; logistica: string | null; ultima_actualizacion: string | null; comision: number }[]>()
      : { data: [] };
    const existentePorId = new Map((existentes ?? []).map((o) => [o.id, o]));
    const conEnvioListo = new Set((existentes ?? []).filter((o) => o.costo_envio_vendedor !== null && o.logistica).map((o) => o.id));
    const sinCambios = (orden: OrdenApi) => {
      const e = existentePorId.get(orden.id);
      if (!e || !conEnvioListo.has(orden.id) || !orden.last_updated || !e.ultima_actualizacion) return false;
      return new Date(e.ultima_actualizacion).getTime() === new Date(orden.last_updated).getTime();
    };
    const pendientes = resultados.filter((o) => !sinCambios(o));

    // Varias órdenes a la vez (cada una hace 2-3 llamadas a ML).
    await enGrupos(pendientes, 8, (orden) => guardarOrden(orden, !conEnvioListo.has(orden.id)));

    // El total general solo lo dice la primera ventana (sin tope de fecha);
    // en las siguientes, el total de ML es solo el de esa ventana.
    const totalVentana = pagina.paging?.total ?? null;
    const total = hastaIso ? null : totalVentana;
    const hayMas = resultados.length === TAMANO_PAGINA && (totalVentana === null || offset + TAMANO_PAGINA < totalVentana);
    let siguiente: number | null = hayMas ? offset + TAMANO_PAGINA : null;
    if (siguiente !== null && siguiente + TAMANO_PAGINA > LIMITE_OFFSET_ML) {
      // Se cierra la ventana: la próxima página empieza de cero, pero solo
      // con órdenes de la fecha más vieja de esta página hacia atrás.
      const masVieja = resultados[resultados.length - 1]?.date_created;
      if (masVieja) {
        hastaIso = unSegundoDespues(masVieja);
        siguiente = 0;
      }
    }
    if (!hayMas) {
      const { count } = await supabase.from("mercadolibre_ordenes").select("id", { count: "exact", head: true });
      await supabase.from("mercadolibre_sync").upsert({
        id: 1,
        ultima_sync: new Date().toISOString(),
        ultimo_error: null,
        ordenes_total: count ?? 0,
      });
    }
    return { guardadas: resultados.length, siguiente, total, desdeIso, hastaIso };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error desconocido";
    await supabase.from("mercadolibre_sync").upsert({ id: 1, ultimo_error: mensaje });
    throw e;
  }
}

/** Sincronización completa en una sola llamada (para el refresco
 * automático corto de 2 días al abrir la pantalla). */
export async function sincronizarOrdenes(opciones: { diasAtras?: number } = {}) {
  let guardadas = 0;
  let offset: number | null = 0;
  let desdeIso: string | undefined;
  let hastaIso: string | undefined;
  while (offset !== null) {
    const r: ResultadoPaginaOrdenes = await sincronizarPaginaOrdenes({ ...opciones, offset, desdeIso, hastaIso });
    guardadas += r.guardadas;
    offset = r.siguiente;
    desdeIso = r.desdeIso;
    hastaIso = r.hastaIso;
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

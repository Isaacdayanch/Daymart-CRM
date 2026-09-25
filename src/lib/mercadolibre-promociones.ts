// Promociones de Mercado Libre desde el CRM. REGLA DE ISAAC (25 sep): el
// precio base de la publicación NUNCA se cambia desde aquí — un precio más
// bajo se aplica siempre como PROMOCIÓN (descuento del vendedor o campaña
// de ML), que se puede quitar y deja el precio original intacto.
// Nada es automático: Isaac ve el margen que le quedaría y confirma.
//
// Nota: la documentación de ML no se pudo leer desde este entorno (egress
// bloqueado); los campos se armaron de memoria de la API
// /seller-promotions (app_version=v2) y se leen a la defensiva. Cada
// respuesta cruda se guarda para poder diagnosticar con Isaac.

import { createServiceClient } from "@/lib/supabase/servicio";
import { mercadolibreDelete, mercadolibreGet } from "@/lib/mercadolibre-auth";
import { mercadolibrePost } from "@/lib/mercadolibre-post";
import type { OrdenItemMl, OrdenMl } from "@/lib/mercadolibre-ordenes";

const DIA_MS = 86400000;

/** Nombres en español de los tipos de promoción de Mercado Libre. */
export const TIPOS_PROMOCION: Record<string, string> = {
  PRICE_DISCOUNT: "Descuento del vendedor",
  DEAL: "Oferta del día / campaña",
  LIGHTNING: "Oferta relámpago",
  DOD: "Oferta del día",
  MARKETPLACE_CAMPAIGN: "Campaña de Mercado Libre",
  SELLER_CAMPAIGN: "Campaña del vendedor",
  PRE_NEGOTIATED: "Campaña co-financiada",
  SMART: "Campaña inteligente",
  PRICE_MATCHING: "Igualación de precio",
  PRICE_MATCHING_MELI_ALL: "Igualación de precio (ML)",
  VOLUME: "Descuento por volumen",
  UNHEALTHY_STOCK: "Stock sin rotación",
};

export const ESTADOS_PROMOCION: Record<string, string> = {
  candidate: "Disponible",
  pending: "Pendiente",
  started: "Activa",
  finished: "Terminada",
  cancelled: "Cancelada",
  rejected: "Rechazada",
};

export interface PromocionItem {
  id: string | null;
  tipo: string;
  nombre: string | null;
  estado: string | null;
  inicio: string | null;
  fin: string | null;
  /** Hasta cuándo se puede aceptar (campañas). */
  limite: string | null;
  /** Precio ya aplicado (si está activa). */
  precioPromo: number | null;
  precioOriginal: number | null;
  precioSugerido: number | null;
  precioMin: number | null;
  precioMax: number | null;
  /** Parte del descuento que pone Mercado Libre (%). */
  meliPct: number | null;
  sellerPct: number | null;
  /** Respuesta cruda para diagnóstico. */
  crudo: Record<string, unknown>;
}

function numero(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
function textoDe(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

/** Promociones de una publicación: las activas, las pendientes y las que
 * ML le ofrece (candidatas). */
export async function promocionesDeItem(itemId: string): Promise<PromocionItem[]> {
  const r = await mercadolibreGet<unknown>(`/seller-promotions/items/${itemId}?app_version=v2`);
  const lista = Array.isArray(r) ? (r as Record<string, unknown>[]) : r && typeof r === "object" && Array.isArray((r as { results?: unknown }).results) ? ((r as { results: Record<string, unknown>[] }).results) : [];
  return lista.map((p) => {
    const benef = (p.benefits ?? {}) as Record<string, unknown>;
    return {
      id: textoDe(p.id) ?? textoDe(p.promotion_id),
      tipo: textoDe(p.type) ?? textoDe(p.promotion_type) ?? "?",
      nombre: textoDe(p.name),
      estado: textoDe(p.status),
      inicio: textoDe(p.start_date),
      fin: textoDe(p.finish_date),
      limite: textoDe(p.deadline_date),
      precioPromo: numero(p.price) ?? numero(p.deal_price),
      precioOriginal: numero(p.original_price),
      precioSugerido: numero(p.suggested_discounted_price) ?? numero(p.min_discounted_price),
      precioMin: numero(p.min_discounted_price),
      precioMax: numero(p.max_discounted_price),
      meliPct: numero(benef.meli_percent),
      sellerPct: numero(benef.seller_percent),
      crudo: p,
    };
  });
}

export interface SolicitudPromocion {
  itemId: string;
  titulo?: string | null;
  tipo: string;
  promocionId?: string | null;
  /** Precio con descuento (por pieza). */
  precioPromo?: number | null;
  precioBase?: number | null;
  /** Solo para PRICE_DISCOUNT: fechas ISO con offset; sin fin = indefinida. */
  inicio?: string | null;
  fin?: string | null;
  modo?: string | null;
  margenEstimadoPct?: number | null;
}

export interface ResultadoPromocion {
  itemId: string;
  ok: boolean;
  error?: string;
  crudo?: unknown;
}

/** Aplica una promoción a una publicación (POST /seller-promotions/items/{id}). */
export async function aplicarPromocion(s: SolicitudPromocion): Promise<ResultadoPromocion> {
  const supabase = createServiceClient();
  const cuerpo: Record<string, unknown> = { promotion_type: s.tipo };
  if (s.promocionId) cuerpo.promotion_id = s.promocionId;
  if (s.precioPromo) cuerpo.deal_price = s.precioPromo;
  if (s.tipo === "PRICE_DISCOUNT") {
    if (s.inicio) cuerpo.start_date = s.inicio;
    if (s.fin) cuerpo.finish_date = s.fin;
  }
  const bitacora = {
    item_id: s.itemId,
    variation_id: null,
    titulo: s.titulo ?? null,
    precio_anterior: s.precioBase ?? null,
    precio_nuevo: s.precioPromo ?? s.precioBase ?? 0,
    modo: s.modo ?? null,
    margen_estimado_pct: s.margenEstimadoPct ?? null,
    accion: "APLICAR",
    promocion_tipo: s.tipo,
    promocion_id: s.promocionId ?? null,
    fin_promocion: s.fin ?? null,
  };
  try {
    const r = await mercadolibrePost<unknown>(`/seller-promotions/items/${s.itemId}?app_version=v2`, cuerpo);
    await insertarBitacora(supabase, { ...bitacora, resultado: "OK" });
    // El precio con promo se refleja en la copia local hasta la siguiente
    // sincronización; aquí solo se anota el original si no lo teníamos.
    if (s.precioPromo && s.precioBase) {
      await supabase.from("mercadolibre_publicaciones").update({ precio: s.precioPromo, precio_original: s.precioBase }).eq("item_id", s.itemId);
    }
    return { itemId: s.itemId, ok: true, crudo: r };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error desconocido";
    await insertarBitacora(supabase, { ...bitacora, resultado: "ERROR", error: mensaje });
    return { itemId: s.itemId, ok: false, error: mensaje };
  }
}

/** Quita la publicación de una promoción (DELETE). El precio base queda igual. */
export async function quitarPromocion(s: { itemId: string; titulo?: string | null; tipo: string; promocionId?: string | null; precioBase?: number | null }): Promise<ResultadoPromocion> {
  const supabase = createServiceClient();
  const params = new URLSearchParams({ app_version: "v2", promotion_type: s.tipo });
  if (s.promocionId) params.set("promotion_id", s.promocionId);
  const bitacora = {
    item_id: s.itemId,
    variation_id: null,
    titulo: s.titulo ?? null,
    precio_anterior: null,
    precio_nuevo: s.precioBase ?? 0,
    modo: null,
    margen_estimado_pct: null,
    accion: "QUITAR",
    promocion_tipo: s.tipo,
    promocion_id: s.promocionId ?? null,
    fin_promocion: null,
  };
  try {
    const r = await mercadolibreDelete<unknown>(`/seller-promotions/items/${s.itemId}?${params}`);
    await insertarBitacora(supabase, { ...bitacora, resultado: "OK" });
    if (s.precioBase) await supabase.from("mercadolibre_publicaciones").update({ precio: s.precioBase, precio_original: null }).eq("item_id", s.itemId);
    return { itemId: s.itemId, ok: true, crudo: r };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error desconocido";
    await insertarBitacora(supabase, { ...bitacora, resultado: "ERROR", error: mensaje });
    return { itemId: s.itemId, ok: false, error: mensaje };
  }
}

const COLUMNAS_0041 = ["accion", "promocion_tipo", "promocion_id", "fin_promocion"];

async function insertarBitacora(supabase: ReturnType<typeof createServiceClient>, fila: Record<string, unknown>) {
  const { error } = await supabase.from("mercadolibre_cambios_precio").insert(fila);
  if (error && COLUMNAS_0041.some((c) => error.message.includes(c))) {
    // SQL 0041 sin correr: se guarda sin las columnas nuevas.
    await supabase.from("mercadolibre_cambios_precio").insert(Object.fromEntries(Object.entries(fila).filter(([k]) => !COLUMNAS_0041.includes(k))));
  }
}

export interface CambioPromocion {
  id: string;
  item_id: string;
  titulo: string | null;
  precio_anterior: number | null;
  precio_nuevo: number;
  modo: string | null;
  margen_estimado_pct: number | null;
  resultado: string;
  error: string | null;
  creado_en: string;
  deshecho_en: string | null;
  accion?: string | null;
  promocion_tipo?: string | null;
  promocion_id?: string | null;
  fin_promocion?: string | null;
}

export async function obtenerBitacoraPromociones(limite = 50): Promise<CambioPromocion[]> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("mercadolibre_cambios_precio").select("*").order("creado_en", { ascending: false }).limit(limite).returns<CambioPromocion[]>();
  return data ?? [];
}

/** "Deshacer" un APLICAR de la bitácora = quitar esa promoción. */
export async function deshacerPromocion(cambioId: string): Promise<ResultadoPromocion> {
  const supabase = createServiceClient();
  const { data: c } = await supabase.from("mercadolibre_cambios_precio").select("*").eq("id", cambioId).maybeSingle<CambioPromocion>();
  if (!c) throw new Error("No se encontró ese registro.");
  if (c.deshecho_en) throw new Error("Esa promoción ya se había quitado.");
  if (c.resultado !== "OK" || (c.accion ?? "APLICAR") !== "APLICAR") throw new Error("Ese registro no aplicó ninguna promoción, no hay nada que quitar.");
  const r = await quitarPromocion({ itemId: c.item_id, titulo: c.titulo, tipo: c.promocion_tipo ?? "PRICE_DISCOUNT", promocionId: c.promocion_id, precioBase: c.precio_anterior });
  if (r.ok) await supabase.from("mercadolibre_cambios_precio").update({ deshecho_en: new Date().toISOString() }).eq("id", cambioId);
  return r;
}

// ---- Datos para el margen (ventas reales) ----

/** Envío promedio a cargo del vendedor por pieza, por publicación, según las
 * ventas reales de los últimos `dias` días (solo órdenes pagadas con costo
 * de envío ya publicado por ML). Sin ventas con dato → no está en el mapa. */
export function envioPromedioPorItem(ordenes: OrdenMl[], items: OrdenItemMl[], dias = 90) {
  const desde = Date.now() - dias * DIA_MS;
  const porOrden = new Map(ordenes.filter((o) => o.estado === "paid" && o.costo_envio_vendedor !== null && new Date(o.fecha_creacion).getTime() >= desde).map((o) => [o.id, o]));
  const acumulado = new Map<string, { costo: number; piezas: number }>();
  const piezasPorOrden = new Map<number, number>();
  for (const i of items) if (porOrden.has(i.orden_id)) piezasPorOrden.set(i.orden_id, (piezasPorOrden.get(i.orden_id) ?? 0) + i.cantidad);
  for (const i of items) {
    const o = porOrden.get(i.orden_id);
    if (!o || !i.item_id) continue;
    const piezasOrden = piezasPorOrden.get(o.id) ?? i.cantidad;
    const parte = (o.costo_envio_vendedor ?? 0) * (i.cantidad / piezasOrden);
    const a = acumulado.get(i.item_id) ?? { costo: 0, piezas: 0 };
    acumulado.set(i.item_id, { costo: a.costo + parte, piezas: a.piezas + i.cantidad });
  }
  const r = new Map<string, number>();
  for (const [itemId, a] of acumulado) if (a.piezas > 0) r.set(itemId, Math.round((a.costo / a.piezas) * 100) / 100);
  return r;
}

/** Piezas vendidas (órdenes pagadas) por publicación en los últimos `dias`. */
export function piezasVendidasPorItem(ordenes: OrdenMl[], items: OrdenItemMl[], dias: number) {
  const desde = Date.now() - dias * DIA_MS;
  const pagadas = new Set(ordenes.filter((o) => o.estado === "paid" && new Date(o.fecha_creacion).getTime() >= desde).map((o) => o.id));
  const r = new Map<string, number>();
  for (const i of items) {
    if (!pagadas.has(i.orden_id) || !i.item_id) continue;
    r.set(i.item_id, (r.get(i.item_id) ?? 0) + i.cantidad);
  }
  return r;
}

export async function obtenerMargenMinimo(): Promise<number> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("mercadolibre_sync").select("margen_minimo_pct").eq("id", 1).maybeSingle<{ margen_minimo_pct: number | null }>();
  return data?.margen_minimo_pct ?? 20;
}

export async function guardarMargenMinimo(pct: number) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("mercadolibre_sync").upsert({ id: 1, margen_minimo_pct: pct });
  if (error) throw new Error(`No se pudo guardar el margen mínimo (¿falta el SQL 0040?): ${error.message}`);
}

/** Preguntas sin responder en Mercado Libre (una llamada, para el resumen del día). */
export async function preguntasSinResponder(mlUserId: number): Promise<number | null> {
  try {
    const r = await mercadolibreGet<{ total?: number }>(`/my/received_questions/search?seller_id=${mlUserId}&status=UNANSWERED&limit=1`);
    return r.total ?? 0;
  } catch {
    return null;
  }
}

/** Fecha "AAAA-MM-DD" → ISO con el offset de Ciudad de México (inicio o fin del día). */
export function isoFechaMx(fechaTexto: string, finDelDia = false) {
  const hora = finDelDia ? "23:59:59" : "00:00:00";
  const referencia = new Date(`${fechaTexto}T12:00:00Z`);
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: "America/Mexico_City", timeZoneName: "longOffset" }).formatToParts(referencia);
  const offset = partes.find((p) => p.type === "timeZoneName")?.value.replace("GMT", "") || "-06:00";
  return `${fechaTexto}T${hora}${offset === "" ? "-06:00" : offset}`;
}

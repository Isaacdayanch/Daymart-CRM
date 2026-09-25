// Cambios de precio en Mercado Libre desde el CRM, con bitácora y "deshacer".
// Nada es automático: Isaac ve el margen que le quedaría y confirma.

import { createServiceClient } from "@/lib/supabase/servicio";
import { mercadolibreGet, mercadolibrePut } from "@/lib/mercadolibre-auth";
import type { OrdenItemMl, OrdenMl } from "@/lib/mercadolibre-ordenes";

export interface CambioPrecio {
  id: string;
  item_id: string;
  variation_id: number | null;
  titulo: string | null;
  precio_anterior: number | null;
  precio_nuevo: number;
  modo: string | null;
  margen_estimado_pct: number | null;
  resultado: string;
  error: string | null;
  creado_en: string;
  deshecho_en: string | null;
}

const DIA_MS = 86400000;

/** Envío promedio a cargo del vendedor por pieza, por publicación, según las
 * ventas reales de los últimos `dias` días (solo órdenes pagadas con costo
 * de envío ya publicado por ML). Sin ventas con dato → no está en el mapa. */
export function envioPromedioPorItem(ordenes: OrdenMl[], items: OrdenItemMl[], dias = 90) {
  const desde = Date.now() - dias * DIA_MS;
  const porOrden = new Map(ordenes.filter((o) => o.estado === "paid" && o.costo_envio_vendedor !== null && new Date(o.fecha_creacion).getTime() >= desde).map((o) => [o.id, o]));
  const acumulado = new Map<string, { costo: number; piezas: number }>();
  // El envío es por orden: se reparte entre las piezas de la orden.
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

export interface SolicitudPrecio {
  itemId: string;
  variationId: number | null;
  precioNuevo: number;
  titulo?: string | null;
  modo?: "FIJO" | "PORCENTAJE" | "MARGEN";
  margenEstimadoPct?: number | null;
}

export interface ResultadoPrecio {
  itemId: string;
  variationId: number | null;
  ok: boolean;
  error?: string;
  precioAnterior: number | null;
  precioNuevo: number;
  /** Comisión real de ML al precio nuevo (si se pudo consultar). */
  comisionReal?: number | null;
}

/** Cambia el precio en Mercado Libre (PUT /items/{id}, o la variante) y
 * lo anota en la bitácora. Un item con variantes se cambia variante por
 * variante; sin variantes, el precio del item. */
export async function aplicarCambioPrecio(s: SolicitudPrecio): Promise<ResultadoPrecio> {
  const supabase = createServiceClient();
  type PubMin = { precio: number | null; titulo: string | null; categoria_id?: string | null; tipo_publicacion?: string | null };
  let consulta = supabase.from("mercadolibre_publicaciones").select("precio, titulo, categoria_id, tipo_publicacion").eq("item_id", s.itemId);
  consulta = s.variationId === null ? consulta.is("variation_id", null) : consulta.eq("variation_id", s.variationId);
  const { data: pub } = await consulta.maybeSingle<PubMin>();
  const precioAnterior = pub?.precio ?? null;
  const titulo = s.titulo ?? pub?.titulo ?? null;
  const base = { item_id: s.itemId, variation_id: s.variationId, titulo, precio_anterior: precioAnterior, precio_nuevo: s.precioNuevo, modo: s.modo ?? null, margen_estimado_pct: s.margenEstimadoPct ?? null };

  if (!(s.precioNuevo > 0)) return { itemId: s.itemId, variationId: s.variationId, ok: false, error: "Precio inválido.", precioAnterior, precioNuevo: s.precioNuevo };

  try {
    if (s.variationId === null) {
      await mercadolibrePut(`/items/${s.itemId}`, { price: s.precioNuevo });
    } else {
      await mercadolibrePut(`/items/${s.itemId}/variations/${s.variationId}`, { price: s.precioNuevo });
    }
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error desconocido";
    await supabase.from("mercadolibre_cambios_precio").insert({ ...base, resultado: "ERROR", error: mensaje });
    return { itemId: s.itemId, variationId: s.variationId, ok: false, error: mensaje, precioAnterior, precioNuevo: s.precioNuevo };
  }

  // Copia local al día (sin esperar la siguiente sincronización) + comisión real al precio nuevo.
  let comisionReal: number | null = null;
  let comisionPct: number | null = null;
  let comisionFija: number | null = null;
  if (pub?.categoria_id) {
    try {
      const params = new URLSearchParams({ price: String(s.precioNuevo), category_id: pub.categoria_id });
      if (pub.tipo_publicacion) params.set("listing_type_id", pub.tipo_publicacion);
      const r = await mercadolibreGet<{ listing_type_id: string; sale_fee_amount?: number; sale_fee_details?: { percentage_fee?: number; fixed_fee?: number } }[] | { listing_type_id: string; sale_fee_amount?: number; sale_fee_details?: { percentage_fee?: number; fixed_fee?: number } }>(`/sites/MLM/listing_prices?${params}`);
      const lista = Array.isArray(r) ? r : [r];
      const fila = lista.find((l) => l.listing_type_id === pub.tipo_publicacion) ?? lista[0];
      if (fila) {
        comisionReal = fila.sale_fee_amount ?? null;
        comisionPct = fila.sale_fee_details?.percentage_fee ?? null;
        comisionFija = fila.sale_fee_details?.fixed_fee ?? 0;
      }
    } catch {
      // la comisión se refresca en la siguiente sincronización
    }
  }
  const actualizacion: Record<string, unknown> = { precio: s.precioNuevo };
  if (comisionPct !== null) {
    actualizacion.comision_pct = comisionPct;
    actualizacion.comision_fija = comisionFija;
  }
  let q = supabase.from("mercadolibre_publicaciones").update(actualizacion).eq("item_id", s.itemId);
  q = s.variationId === null ? q.is("variation_id", null) : q.eq("variation_id", s.variationId);
  const { error: errorLocal } = await q;
  if (errorLocal && comisionPct !== null) {
    let q2 = supabase.from("mercadolibre_publicaciones").update({ precio: s.precioNuevo }).eq("item_id", s.itemId);
    q2 = s.variationId === null ? q2.is("variation_id", null) : q2.eq("variation_id", s.variationId);
    await q2;
  }
  await supabase.from("mercadolibre_cambios_precio").insert({ ...base, resultado: "OK" });
  return { itemId: s.itemId, variationId: s.variationId, ok: true, precioAnterior, precioNuevo: s.precioNuevo, comisionReal };
}

/** Regresa el precio anterior de un cambio hecho desde el CRM. */
export async function deshacerCambioPrecio(cambioId: string): Promise<ResultadoPrecio> {
  const supabase = createServiceClient();
  const { data: cambio } = await supabase.from("mercadolibre_cambios_precio").select("*").eq("id", cambioId).maybeSingle<CambioPrecio>();
  if (!cambio) throw new Error("No se encontró ese cambio.");
  if (cambio.deshecho_en) throw new Error("Ese cambio ya se había deshecho.");
  if (cambio.resultado !== "OK") throw new Error("Ese cambio no se aplicó en Mercado Libre, no hay nada que deshacer.");
  if (!cambio.precio_anterior) throw new Error("No se guardó el precio anterior de ese cambio.");
  const r = await aplicarCambioPrecio({ itemId: cambio.item_id, variationId: cambio.variation_id, precioNuevo: cambio.precio_anterior, titulo: cambio.titulo, modo: "FIJO" });
  if (r.ok) await supabase.from("mercadolibre_cambios_precio").update({ deshecho_en: new Date().toISOString() }).eq("id", cambioId);
  return r;
}

export async function obtenerCambiosPrecio(limite = 50): Promise<CambioPrecio[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("mercadolibre_cambios_precio").select("*").order("creado_en", { ascending: false }).limit(limite).returns<CambioPrecio[]>();
  if (error) return [];
  return data ?? [];
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

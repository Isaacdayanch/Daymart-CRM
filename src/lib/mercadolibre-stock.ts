// Publicaciones y stock en Full de Mercado Libre (solo lectura desde ML).
// Cada variante es un renglón. Dos publicaciones que comparten inventario en
// Full (tradicional + catálogo) traen el MISMO inventory_id: en los totales
// se cuenta una sola vez.

import { createServiceClient } from "@/lib/supabase/servicio";
import { mercadolibreGet, obtenerConexion } from "@/lib/mercadolibre-auth";

export interface PublicacionMl {
  id: string;
  item_id: string;
  variation_id: number | null;
  titulo: string | null;
  variacion: string | null;
  imagen_url: string | null;
  precio: number | null;
  estado: string | null;
  logistica: string | null;
  seller_sku: string | null;
  catalogo: boolean;
  relacion_item_id: string | null;
  inventory_id: string | null;
  cantidad_publicada: number | null;
  full_disponible: number | null;
  full_no_disponible: number | null;
  full_detalle: { status: string; quantity: number }[] | null;
  actualizado_en: string;
  /** Migración 0040: para calcular margen sin volver a llamar a ML. */
  categoria_id?: string | null;
  tipo_publicacion?: string | null;
  precio_original?: number | null;
  comision_pct?: number | null;
  comision_fija?: number | null;
}

export interface VinculoMl {
  id: string;
  item_id: string;
  variation_id: number | null;
  sku_crm: string;
  /** Piezas del CRM que son UNA unidad de esta publicación (migración 0047):
   * 1 normal, 2 para un par de mancuernas. */
  piezas_por_unidad?: number | null;
}

/** Mapa clave de publicación → piezas del CRM por unidad de ML (≥ 1). */
export function factoresVinculos(vinculos: VinculoMl[]): Map<string, number> {
  return new Map(vinculos.map((v) => [claveVinculo(v.item_id, v.variation_id), Math.max(1, Math.round(Number(v.piezas_por_unidad) || 1))]));
}

/** Factor de una publicación: el de su liga manual (o el de su item sin
 * variación); sin liga manual = 1. */
export function factorDePublicacion(itemId: string, variationId: number | null, factores: Map<string, number> | undefined) {
  if (!factores) return 1;
  return factores.get(claveVinculo(itemId, variationId)) ?? (variationId !== null ? factores.get(claveVinculo(itemId, null)) : undefined) ?? 1;
}

interface ItemApi {
  id: string;
  title?: string;
  price?: number;
  original_price?: number | null;
  category_id?: string;
  listing_type_id?: string;
  available_quantity?: number;
  status?: string;
  thumbnail?: string;
  pictures?: { id?: string; secure_url?: string; url?: string }[];
  seller_custom_field?: string | null;
  catalog_listing?: boolean;
  item_relations?: { id?: string; variation_id?: number | null; stock_relation?: number }[];
  inventory_id?: string | null;
  shipping?: { logistic_type?: string };
  attributes?: { id?: string; value_name?: string | null }[];
  variations?: {
    id: number;
    price?: number;
    available_quantity?: number;
    seller_custom_field?: string | null;
    inventory_id?: string | null;
    picture_ids?: string[];
    attribute_combinations?: { name?: string; value_name?: string | null }[];
    attributes?: { id?: string; value_name?: string | null }[];
  }[];
}

interface StockFullApi {
  inventory_id?: string;
  total?: number;
  available_quantity?: number;
  not_available_quantity?: number;
  not_available_detail?: { status: string; quantity: number }[];
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

export const ESTADOS_PUBLICACION: Record<string, string> = {
  active: "Activa",
  paused: "Pausada",
  closed: "Finalizada",
  under_review: "En revisión",
  inactive: "Inactiva",
};

function skuDe(campo: string | null | undefined, atributos: { id?: string; value_name?: string | null }[] | undefined) {
  const attr = atributos?.find((a) => a.id === "SELLER_SKU")?.value_name;
  return (campo && campo.trim()) || (attr && attr.trim()) || null;
}

/** Todos los IDs de publicaciones del vendedor (activas, pausadas, etc.). */
async function idsPublicaciones(mlUserId: number) {
  const ids: string[] = [];
  let scrollId: string | null = null;
  for (let vuelta = 0; vuelta < 200; vuelta++) {
    const params = new URLSearchParams({ search_type: "scan", limit: "100" });
    if (scrollId) params.set("scroll_id", scrollId);
    const r = await mercadolibreGet<{ results?: string[]; scroll_id?: string }>(`/users/${mlUserId}/items/search?${params}`);
    const lote = r.results ?? [];
    ids.push(...lote);
    if (!lote.length || !r.scroll_id) break;
    scrollId = r.scroll_id;
  }
  return Array.from(new Set(ids));
}

async function stockFull(inventoryId: string, cache: Map<string, StockFullApi | null>) {
  if (cache.has(inventoryId)) return cache.get(inventoryId) ?? null;
  try {
    const r = await mercadolibreGet<StockFullApi>(`/inventories/${inventoryId}/stock/fulfillment`);
    cache.set(inventoryId, r);
    return r;
  } catch {
    cache.set(inventoryId, null);
    return null;
  }
}

/** Comisión de Mercado Libre (% y parte fija) para un precio, categoría y
 * tipo de publicación — lo mismo que consulta el simulador oficial. Con
 * caché por corrida: muchas publicaciones comparten categoría y precio. */
async function comisionDe(precio: number | null | undefined, categoriaId: string | undefined, tipo: string | undefined, cache: Map<string, { pct: number; fija: number } | null>) {
  if (!precio || !categoriaId) return null;
  const clave = `${categoriaId}|${tipo ?? ""}|${precio}`;
  if (cache.has(clave)) return cache.get(clave) ?? null;
  try {
    const params = new URLSearchParams({ price: String(precio), category_id: categoriaId });
    if (tipo) params.set("listing_type_id", tipo);
    const r = await mercadolibreGet<ListingPriceApi[] | ListingPriceApi>(`/sites/MLM/listing_prices?${params}`);
    const lista = Array.isArray(r) ? r : [r];
    const fila = lista.find((l) => !tipo || l.listing_type_id === tipo) ?? lista[0];
    const valor = fila
      ? {
          pct: fila.sale_fee_details?.percentage_fee ?? (fila.sale_fee_amount && precio ? ((fila.sale_fee_amount - (fila.sale_fee_details?.fixed_fee ?? 0)) / precio) * 100 : 0),
          fija: fila.sale_fee_details?.fixed_fee ?? 0,
        }
      : null;
    cache.set(clave, valor);
    return valor;
  } catch {
    cache.set(clave, null);
    return null;
  }
}

interface ListingPriceApi {
  listing_type_id: string;
  sale_fee_amount?: number;
  sale_fee_details?: { percentage_fee?: number; fixed_fee?: number; gross_amount?: number };
}

/** Columnas de la migración 0040: si el SQL no se ha corrido, se quitan
 * de las filas para que la sincronización no truene. */
const COLUMNAS_0040 = ["categoria_id", "tipo_publicacion", "precio_original", "comision_pct", "comision_fija"];

/** Paso 1 de la sincronización por tandas: la lista de IDs. */
export async function listarIdsPublicaciones() {
  const conexion = await obtenerConexion();
  if (!conexion) throw new Error("Mercado Libre no está conectado.");
  return idsPublicaciones(conexion.ml_user_id);
}

/** Paso 2 (se repite): trae un lote de publicaciones con su stock en Full y
 * lo guarda. Cada lote reemplaza SOLO sus propias publicaciones (por
 * item_id), así la tabla nunca se queda vacía a media sincronización — al
 * final, `terminarSyncPublicaciones(inicio)` borra las que ML ya no tiene.
 * Las ligas viven en otra tabla, no se pierden. */
export async function sincronizarLotePublicaciones(ids: string[]) {
  const supabase = createServiceClient();
  if (!ids.length) return 0;
  try {
    const cacheFull = new Map<string, StockFullApi | null>();
    const cacheComision = new Map<string, { pct: number; fija: number } | null>();
    const atributos =
      "id,title,price,original_price,category_id,listing_type_id,available_quantity,status,thumbnail,pictures,seller_custom_field,catalog_listing,item_relations,inventory_id,shipping,attributes,variations";

    // Los lotes de 20 items se piden en paralelo.
    const lotes: string[][] = [];
    for (let i = 0; i < ids.length; i += 20) lotes.push(ids.slice(i, i + 20));
    const respuestas = await Promise.all(
      lotes.map((lote) => mercadolibreGet<{ code: number; body: ItemApi }[]>(`/items?ids=${lote.join(",")}&attributes=${atributos}`)),
    );
    const items = respuestas.flat().filter((r) => r.code === 200 && r.body).map((r) => r.body);

    // Stock en Full: todos los inventarios distintos, en paralelo.
    const inventarios = new Set<string>();
    for (const body of items) {
      if (body.inventory_id) inventarios.add(body.inventory_id);
      for (const v of body.variations ?? []) if (v.inventory_id) inventarios.add(v.inventory_id);
    }
    await Promise.all(Array.from(inventarios).map((inv) => stockFull(inv, cacheFull)));
    // Comisión de ML al precio actual (solo publicaciones activas: las
    // pausadas no la necesitan y así se hacen menos llamadas).
    await Promise.all(
      items
        .filter((b) => b.status === "active")
        .flatMap((b) => ((b.variations ?? []).length ? (b.variations ?? []).map((v) => v.price ?? b.price) : [b.price]).map((precio) => comisionDe(precio, b.category_id, b.listing_type_id, cacheComision))),
    );

    const filas: Record<string, unknown>[] = [];
    for (const body of items) {
      const logistica = body.shipping?.logistic_type ? (LOGISTICA[body.shipping.logistic_type] ?? body.shipping.logistic_type) : null;
      const relacion = body.item_relations?.[0]?.id ?? null;
      const imagenPorId = new Map((body.pictures ?? []).map((p) => [p.id ?? "", p.secure_url ?? p.url ?? null]));
      const imagenPrincipal = body.pictures?.[0]?.secure_url ?? body.pictures?.[0]?.url ?? body.thumbnail ?? null;
      const base = {
        item_id: body.id,
        titulo: body.title ?? null,
        estado: body.status ?? null,
        logistica,
        catalogo: Boolean(body.catalog_listing),
        relacion_item_id: relacion,
        actualizado_en: new Date().toISOString(),
        categoria_id: body.category_id ?? null,
        tipo_publicacion: body.listing_type_id ?? null,
        precio_original: body.original_price ?? null,
      };
      const comisionPara = (precio: number | null | undefined) => {
        const c = body.status === "active" ? cacheComision.get(`${body.category_id}|${body.listing_type_id ?? ""}|${precio}`) ?? null : null;
        return { comision_pct: c?.pct ?? null, comision_fija: c?.fija ?? null };
      };
      const variantes = body.variations ?? [];
      if (variantes.length === 0) {
        const inv = body.inventory_id ?? null;
        const full = inv ? cacheFull.get(inv) ?? null : null;
        filas.push({
          ...base,
          variation_id: null,
          variacion: null,
          imagen_url: imagenPrincipal,
          precio: body.price ?? null,
          seller_sku: skuDe(body.seller_custom_field, body.attributes),
          inventory_id: inv,
          cantidad_publicada: body.available_quantity ?? null,
          full_disponible: full?.available_quantity ?? null,
          full_no_disponible: full?.not_available_quantity ?? null,
          full_detalle: full?.not_available_detail ?? null,
          ...comisionPara(body.price),
        });
      } else {
        for (const v of variantes) {
          const inv = v.inventory_id ?? null;
          const full = inv ? cacheFull.get(inv) ?? null : null;
          const foto = v.picture_ids?.map((pid) => imagenPorId.get(pid)).find(Boolean) ?? imagenPrincipal;
          filas.push({
            ...base,
            variation_id: v.id,
            variacion:
              (v.attribute_combinations ?? [])
                .map((a) => [a.name, a.value_name].filter(Boolean).join(": "))
                .filter(Boolean)
                .join(" · ") || null,
            imagen_url: foto ?? null,
            precio: v.price ?? body.price ?? null,
            seller_sku: skuDe(v.seller_custom_field, v.attributes) ?? skuDe(body.seller_custom_field, body.attributes),
            inventory_id: inv,
            cantidad_publicada: v.available_quantity ?? null,
            full_disponible: full?.available_quantity ?? null,
            full_no_disponible: full?.not_available_quantity ?? null,
            full_detalle: full?.not_available_detail ?? null,
            ...comisionPara(v.price ?? body.price),
          });
        }
      }
    }

    const { error: errorBorrar } = await supabase.from("mercadolibre_publicaciones").delete().in("item_id", ids);
    if (errorBorrar) throw new Error(errorBorrar.message);
    if (filas.length) {
      const { error } = await supabase.from("mercadolibre_publicaciones").insert(filas);
      if (error) {
        // SQL 0040 sin correr: se reintenta sin las columnas nuevas.
        if (!COLUMNAS_0040.some((c) => error.message.includes(c))) throw new Error(error.message);
        const sinNuevas = filas.map((f) => Object.fromEntries(Object.entries(f).filter(([k]) => !COLUMNAS_0040.includes(k))));
        const { error: error2 } = await supabase.from("mercadolibre_publicaciones").insert(sinNuevas);
        if (error2) throw new Error(error2.message);
      }
    }
    // Foto para el Análisis de venta (migración 0046). Si falla (ej. SQL sin
    // correr), no detiene la sincronización.
    try {
      await registrarFotoPublicaciones(filas);
    } catch {
      // se ignora a propósito
    }
    return filas.length;
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error desconocido";
    await supabase.from("mercadolibre_sync").upsert({ id: 1, ultimo_error_stock: mensaje });
    throw e;
  }
}

/** Historial por tramos (migración 0046): mientras la publicación siga
 * igual (activa / con stock) se alarga `hasta` del tramo abierto; si cambió,
 * se cierra y se abre uno nuevo. Pocas llamadas por lote: una lectura, un
 * update de los que siguen igual, un update de los que cambiaron y un
 * insert de los tramos nuevos. */
async function registrarFotoPublicaciones(filas: Record<string, unknown>[]) {
  if (!filas.length) return;
  const supabase = createServiceClient();
  const ahora = new Date().toISOString();
  const ids = Array.from(new Set(filas.map((f) => f.item_id as string)));
  const { data: abiertos, error } = await supabase
    .from("mercadolibre_publicaciones_historial")
    .select("id, item_id, variation_id, activa, con_stock")
    .in("item_id", ids)
    .eq("abierto", true)
    .returns<{ id: string; item_id: string; variation_id: number | null; activa: boolean; con_stock: boolean }[]>();
  if (error) throw new Error(error.message);
  const abiertoPor = new Map((abiertos ?? []).map((a) => [claveVinculo(a.item_id, a.variation_id), a]));

  const iguales: string[] = [];
  const cambiados: string[] = [];
  const nuevos: Record<string, unknown>[] = [];
  const vistos = new Set<string>();
  for (const f of filas) {
    const clave = claveVinculo(f.item_id as string, (f.variation_id as number | null) ?? null);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const activa = f.estado === "active";
    const disponibles = f.logistica === "Full" ? ((f.full_disponible as number | null) ?? 0) : ((f.cantidad_publicada as number | null) ?? 0);
    const conStock = disponibles > 0;
    const previo = abiertoPor.get(clave);
    if (previo && previo.activa === activa && previo.con_stock === conStock) {
      iguales.push(previo.id);
      continue;
    }
    if (previo) cambiados.push(previo.id);
    nuevos.push({
      item_id: f.item_id,
      variation_id: f.variation_id ?? null,
      inventory_id: f.inventory_id ?? null,
      activa,
      con_stock: conStock,
      disponibles,
      precio: f.precio ?? null,
      desde: ahora,
      hasta: ahora,
      abierto: true,
    });
  }
  // Publicaciones que ML ya no devolvió en este lote pero tenían tramo abierto:
  // se cierran (ya no existen / no se vieron).
  const desaparecidos = (abiertos ?? []).filter((a) => !vistos.has(claveVinculo(a.item_id, a.variation_id))).map((a) => a.id);
  if (iguales.length) await supabase.from("mercadolibre_publicaciones_historial").update({ hasta: ahora }).in("id", iguales);
  const cerrar = [...cambiados, ...desaparecidos];
  if (cerrar.length) await supabase.from("mercadolibre_publicaciones_historial").update({ hasta: ahora, abierto: false }).in("id", cerrar);
  if (nuevos.length) {
    const { error: errorInsert } = await supabase.from("mercadolibre_publicaciones_historial").insert(nuevos);
    if (errorInsert) throw new Error(errorInsert.message);
  }
}

/** Paso 3: borra las publicaciones que no se volvieron a ver en esta pasada
 * (ML ya no las tiene) y marca la sincronización como terminada. */
export async function terminarSyncPublicaciones(inicioIso?: string) {
  const supabase = createServiceClient();
  if (inicioIso) await supabase.from("mercadolibre_publicaciones").delete().lt("actualizado_en", inicioIso);
  await supabase.from("mercadolibre_sync").upsert({ id: 1, ultima_sync_stock: new Date().toISOString(), ultimo_error_stock: null });
  // Con la copia fresca, se anota el historial de Full y se detectan
  // recepciones (el total de un inventario subió). Si la tabla no existe
  // todavía (SQL 0035 sin correr), no debe tumbar la sincronización.
  try {
    const { registrarHistorialFull } = await import("@/lib/salidas-ml");
    await registrarHistorialFull();
  } catch {
    // se reintenta en la siguiente sincronización
  }
}

// --- Actualización automática (sin que Isaac haga nada) -------------------
// La llama /api/mercadolibre/cron cada pocos minutos (desde pg_cron de
// Supabase o el cron de Vercel). Cada llamada trabaja un rato acotado
// (presupuesto) y guarda por dónde va en `mercadolibre_sync.stock_cursor`;
// la siguiente llamada continúa. Solo empieza una pasada nueva cuando la
// última terminó hace más de `cadaMinutos`.

interface CursorStock {
  ids: string[];
  indice: number;
  inicio: string;
}

const TAMANO_LOTE_AUTO = 40;
/** Si una pasada lleva más de esto sin terminar (errores repetidos), se reinicia. */
const CURSOR_CADUCA_MS = 2 * 60 * 60 * 1000;

export async function avanzarSyncPublicaciones(opciones: { presupuestoMs?: number; cadaMinutos?: number } = {}) {
  const presupuestoMs = opciones.presupuestoMs ?? 40000;
  const cadaMinutos = opciones.cadaMinutos ?? 55;
  const supabase = createServiceClient();
  const inicioLlamada = Date.now();

  const { data: sync } = await supabase
    .from("mercadolibre_sync")
    .select("ultima_sync_stock, stock_cursor")
    .eq("id", 1)
    .maybeSingle<{ ultima_sync_stock: string | null; stock_cursor: CursorStock | null }>();
  const guardarCursor = async (cursor: CursorStock | null) => {
    const { error } = await supabase.from("mercadolibre_sync").upsert({ id: 1, stock_cursor: cursor });
    if (error) throw new Error(`No se pudo guardar el avance (¿falta el SQL 0033?): ${error.message}`);
  };

  let cursor = sync?.stock_cursor ?? null;
  if (cursor && Date.now() - new Date(cursor.inicio).getTime() > CURSOR_CADUCA_MS) cursor = null;
  if (!cursor) {
    const ultima = sync?.ultima_sync_stock ? new Date(sync.ultima_sync_stock).getTime() : 0;
    if (Date.now() - ultima < cadaMinutos * 60000) return { estado: "al_dia" as const, procesadas: 0, total: 0 };
    const ids = await listarIdsPublicaciones();
    cursor = { ids, indice: 0, inicio: new Date().toISOString() };
    await guardarCursor(cursor);
  }

  while (cursor.indice < cursor.ids.length && Date.now() - inicioLlamada < presupuestoMs) {
    await sincronizarLotePublicaciones(cursor.ids.slice(cursor.indice, cursor.indice + TAMANO_LOTE_AUTO));
    cursor = { ...cursor, indice: cursor.indice + TAMANO_LOTE_AUTO };
    await guardarCursor(cursor);
  }

  if (cursor.indice >= cursor.ids.length) {
    await terminarSyncPublicaciones(cursor.inicio);
    await guardarCursor(null);
    return { estado: "termino" as const, procesadas: cursor.ids.length, total: cursor.ids.length };
  }
  return { estado: "avanzo" as const, procesadas: Math.min(cursor.indice, cursor.ids.length), total: cursor.ids.length };
}

export async function obtenerPublicaciones(): Promise<PublicacionMl[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("mercadolibre_publicaciones").select("*").order("titulo").returns<PublicacionMl[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function obtenerVinculos(): Promise<VinculoMl[]> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("mercadolibre_vinculos").select("*").returns<VinculoMl[]>();
  return data ?? [];
}

export function claveVinculo(itemId: string, variationId: number | null) {
  return `${itemId}|${variationId ?? 0}`;
}

/** SKU del CRM de cada publicación: la liga manual manda; si no hay,
 * coincidencia automática cuando el SKU de ML es igual a un SKU del CRM. */
export function skuCrmDe(pub: PublicacionMl, vinculos: Map<string, string>, skusCrm: Set<string>) {
  const manual = vinculos.get(claveVinculo(pub.item_id, pub.variation_id));
  if (manual) return { sku: manual, origen: "manual" as const };
  if (pub.seller_sku && skusCrm.has(pub.seller_sku)) return { sku: pub.seller_sku, origen: "auto" as const };
  return { sku: null, origen: null };
}

export interface ResumenFull {
  /** Piezas disponibles en Full, contando cada inventario UNA vez. */
  piezas: number;
  noDisponibles: number;
  /** Valor a costo promedio del CRM (solo publicaciones ligadas). */
  valor: number;
  inventariosSinLigar: number;
  /** Piezas en Full por SKU del CRM (sin contar doble un inventario compartido). */
  porSku: Map<string, number>;
}

/** Totales de Full sin contar doble los inventarios compartidos. Para el
 * valor y el "por SKU" se usa la primera publicación ligada de cada inventario. */
export function resumenFull(
  publicaciones: PublicacionMl[],
  vinculos: Map<string, string>,
  skusCrm: Set<string>,
  costoPorSku: Map<string, number>,
  /** Piezas del CRM por unidad de ML (migración 0047); sin él, 1. */
  factores?: Map<string, number>,
): ResumenFull {
  const vistos = new Set<string>();
  const r: ResumenFull = { piezas: 0, noDisponibles: 0, valor: 0, inventariosSinLigar: 0, porSku: new Map() };
  // Primero las ligadas, para que un inventario compartido tome el SKU de la que sí está ligada.
  const ordenadas = [...publicaciones].sort((a, b) => Number(Boolean(skuCrmDe(b, vinculos, skusCrm).sku)) - Number(Boolean(skuCrmDe(a, vinculos, skusCrm).sku)));
  for (const p of ordenadas) {
    if (!p.inventory_id || p.full_disponible === null) continue;
    if (vistos.has(p.inventory_id)) continue;
    vistos.add(p.inventory_id);
    r.piezas += p.full_disponible;
    r.noDisponibles += p.full_no_disponible ?? 0;
    const { sku } = skuCrmDe(p, vinculos, skusCrm);
    if (sku) {
      // En piezas del CRM: un "par" en Full son 2 piezas en bodega.
      const piezasCrm = p.full_disponible * factorDePublicacion(p.item_id, p.variation_id, factores);
      r.valor += piezasCrm * (costoPorSku.get(sku) ?? 0);
      r.porSku.set(sku, (r.porSku.get(sku) ?? 0) + piezasCrm);
    } else if (p.full_disponible > 0) {
      r.inventariosSinLigar++;
    }
  }
  return r;
}

/** Resumen de Full listo para usar desde Stock del CRM y el dashboard.
 * Regresa null si la tabla no existe todavía o ML no está conectado —
 * las pantallas siguen funcionando sin Full. */
export async function obtenerResumenFull(resumenes: { sku: string; costoPromedio: number }[]): Promise<ResumenFull | null> {
  try {
    const [publicaciones, vinculos] = await Promise.all([obtenerPublicaciones(), obtenerVinculos()]);
    if (!publicaciones.length) return null;
    return resumenFull(
      publicaciones,
      new Map(vinculos.map((v) => [claveVinculo(v.item_id, v.variation_id), v.sku_crm])),
      new Set(resumenes.map((r) => r.sku)),
      new Map(resumenes.map((r) => [r.sku, r.costoPromedio])),
      factoresVinculos(vinculos),
    );
  } catch {
    return null;
  }
}

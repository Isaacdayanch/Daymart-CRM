// Publicaciones y stock en Full de Mercado Libre (solo lectura desde ML).
// Cada variante es un renglón. Dos publicaciones que comparten inventario en
// Full (tradicional + catálogo) traen el MISMO inventory_id: en los totales
// se cuenta una sola vez.

import { createServiceClient } from "@/lib/supabase/servicio";
import { mercadolibreGet, obtenerConexion } from "@/lib/mercadolibre-auth";
import { todasLasFilas } from "@/lib/cargar-todo";

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
  /** true = es una liga por SKU de ML (item_id = "sku:XXX"), no por publicación. */
  por_sku?: boolean;
  /** true = es una liga por Código ML de Full (item_id = "inv:XXX"). */
  por_codigo?: boolean;
}

/** Liga por Código ML (migración 0055, 21 oct): el Código ML de Full
 * (inventory_id, tipo IPYX23014) → producto del CRM. Es la liga que manda:
 * un código es un producto físico (la publicación normal y la de catálogo lo
 * comparten; cada color tiene el suyo). */
export interface LigaCodigoMl {
  inventory_id: string;
  sku_crm: string;
  piezas_por_unidad: number | null;
}

/** Liga por SKU de Mercado Libre (migración 0048): el SKU que Isaac pone en
 * sus publicaciones → producto del CRM. Aplica a TODAS las publicaciones
 * con ese SKU (dos publicaciones de lo mismo = mismo SKU = mismo producto). */
export interface LigaSkuMl {
  seller_sku: string;
  sku_crm: string;
  piezas_por_unidad: number | null;
}

/** Los SKUs de ML se comparan sin espacios ni mayúsculas/minúsculas. */
export function normalizarSellerSku(sellerSku: string | null | undefined) {
  const s = (sellerSku ?? "").trim().toUpperCase();
  return s || null;
}

/** Prefijo con el que las ligas por SKU viajan dentro del mismo mapa que
 * las ligas por publicación (`clave → sku_crm`), para que todas las
 * pantallas las apliquen sin cambiar su código. */
const PREFIJO_SKU = "sku:";
export function claveLigaSku(sellerSku: string) {
  return claveVinculo(`${PREFIJO_SKU}${sellerSku}`, null);
}

const PREFIJO_CODIGO = "inv:";
export function normalizarCodigoMl(codigo: string | null | undefined) {
  const c = (codigo ?? "").trim().toUpperCase();
  return c || null;
}
export function claveCodigoMl(inventoryId: string) {
  return claveVinculo(`${PREFIJO_CODIGO}${normalizarCodigoMl(inventoryId) ?? inventoryId}`, null);
}

export async function obtenerLigasCodigo(): Promise<LigaCodigoMl[]> {
  const supabase = createServiceClient();
  const { data, error } = await todasLasFilas<LigaCodigoMl>((desde, hasta) =>
    supabase.from("mercadolibre_codigo_vinculos").select("inventory_id, sku_crm, piezas_por_unidad", { count: "exact" }).order("inventory_id").range(desde, hasta),
  );
  if (error) return []; // sin el SQL 0058 simplemente no hay ligas por Código ML
  return data ?? [];
}

/** Las ligas por Código ML convertidas a "vínculos" sintéticos (item_id = "inv:XXX"). */
export function vinculosDesdeLigasCodigo(ligas: LigaCodigoMl[]): VinculoMl[] {
  return ligas
    .map((l) => ({ l, k: normalizarCodigoMl(l.inventory_id) }))
    .filter((x): x is { l: LigaCodigoMl; k: string } => Boolean(x.k))
    .map(({ l, k }) => ({ id: `inv:${k}`, item_id: `${PREFIJO_CODIGO}${k}`, variation_id: null, sku_crm: l.sku_crm, piezas_por_unidad: l.piezas_por_unidad, por_codigo: true }));
}

export async function obtenerLigasSku(): Promise<LigaSkuMl[]> {
  const supabase = createServiceClient();
  const { data, error } = await todasLasFilas<LigaSkuMl>((desde, hasta) =>
    supabase.from("mercadolibre_sku_vinculos").select("seller_sku, sku_crm, piezas_por_unidad", { count: "exact" }).order("seller_sku").range(desde, hasta),
  );
  if (error) return []; // sin el SQL 0048 simplemente no hay ligas por SKU
  return data ?? [];
}

/** SKUs de ML / publicaciones que Isaac marcó "olvidar" en Ligar SKUs
 * (migración 0050): claves `claveLigaSku(sku)` o `claveVinculo(item, variación)`. */
export interface LigaIgnorada {
  clave: string;
  seller_sku: string | null;
  item_id: string | null;
  variation_id: number | null;
  titulo: string | null;
  creado_en: string;
}

export async function obtenerIgnorados(): Promise<LigaIgnorada[]> {
  const supabase = createServiceClient();
  const { data, error } = await todasLasFilas<LigaIgnorada>((desde, hasta) => supabase.from("mercadolibre_ligas_ignoradas").select("*", { count: "exact" }).order("clave").range(desde, hasta));
  if (error) return []; // sin el SQL 0050 simplemente no hay olvidados
  return data ?? [];
}

/** Las ligas por SKU convertidas a "vínculos" sintéticos (item_id = "sku:XXX"). */
export function vinculosDesdeLigasSku(ligas: LigaSkuMl[]): VinculoMl[] {
  return ligas
    .map((l) => ({ l, k: normalizarSellerSku(l.seller_sku) }))
    .filter((x): x is { l: LigaSkuMl; k: string } => Boolean(x.k))
    .map(({ l, k }) => ({ id: `sku:${k}`, item_id: `${PREFIJO_SKU}${k}`, variation_id: null, sku_crm: l.sku_crm, piezas_por_unidad: l.piezas_por_unidad, por_sku: true }));
}

/** Mapa clave de publicación → piezas del CRM por unidad de ML (≥ 1). */
export function factoresVinculos(vinculos: VinculoMl[]): Map<string, number> {
  return new Map(vinculos.map((v) => [claveVinculo(v.item_id, v.variation_id), Math.max(1, Math.round(Number(v.piezas_por_unidad) || 1))]));
}

/** Factor de una publicación, en el mismo orden que la liga: Código ML →
 * publicación/variante → SKU de ML → item sin variación → 1. */
export function factorDePublicacion(itemId: string, variationId: number | null, factores: Map<string, number> | undefined, sellerSku?: string | null, inventoryId?: string | null) {
  if (!factores) return 1;
  if (inventoryId) {
    const f = factores.get(claveCodigoMl(inventoryId));
    if (f !== undefined) return f;
  }
  const propio = factores.get(claveVinculo(itemId, variationId));
  if (propio !== undefined) return propio;
  const porSku = normalizarSellerSku(sellerSku);
  if (porSku) {
    const f = factores.get(claveLigaSku(porSku));
    if (f !== undefined) return f;
  }
  return (variationId !== null ? factores.get(claveVinculo(itemId, null)) : undefined) ?? 1;
}

interface ItemApi {
  id: string;
  seller_id?: number;
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

/** Recorre la búsqueda de publicaciones del vendedor (scan) con un filtro opcional. */
async function escanearIds(mlUserId: number, status?: string) {
  const ids: string[] = [];
  let scrollId: string | null = null;
  for (let vuelta = 0; vuelta < 300; vuelta++) {
    const params = new URLSearchParams({ search_type: "scan", limit: "100" });
    if (status) params.set("status", status);
    if (scrollId) params.set("scroll_id", scrollId);
    const r = await mercadolibreGet<{ results?: string[]; scroll_id?: string }>(`/users/${mlUserId}/items/search?${params}`);
    const lote = r.results ?? [];
    ids.push(...lote);
    if (!lote.length || !r.scroll_id) break;
    scrollId = r.scroll_id;
  }
  return ids;
}

/** Todos los IDs de publicaciones del vendedor. Se junta la búsqueda sin
 * filtro con una por cada estado (activas, pausadas, finalizadas): así no
 * depende de qué devuelve Mercado Libre "por defecto" (14 oct; Isaac:
 * "muchísimas publicaciones no las veo en el CRM"). */
async function idsPublicaciones(mlUserId: number) {
  const todos = new Set<string>();
  for (const status of [undefined, "active", "paused", "closed"]) {
    try {
      for (const id of await escanearIds(mlUserId, status)) todos.add(id);
    } catch (e) {
      // Un filtro que ML rechace no debe tumbar la lista completa.
      if (status === undefined) throw e;
    }
  }
  return Array.from(todos);
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
export async function sincronizarLotePublicaciones(ids: string[]): Promise<{ renglones: number; fallidos: string[] }> {
  const supabase = createServiceClient();
  if (!ids.length) return { renglones: 0, fallidos: [] };
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
    // Las que ML no contestó bien (429 por cuota, 403, etc.) se reintentan
    // UNA vez; las que sigan fallando NO se borran de la copia local (antes
    // se borraban en silencio y "desaparecían" del sistema — caso real, 7 oct).
    const leidos = new Set(items.map((b) => b.id));
    let fallidos = ids.filter((id) => !leidos.has(id));
    if (fallidos.length) {
      await new Promise((r) => setTimeout(r, 1200));
      const reintento = await Promise.all(
        (() => {
          const l: string[][] = [];
          for (let i = 0; i < fallidos.length; i += 20) l.push(fallidos.slice(i, i + 20));
          return l;
        })().map((lote) => mercadolibreGet<{ code: number; body: ItemApi }[]>(`/items?ids=${lote.join(",")}&attributes=${atributos}`).catch(() => [] as { code: number; body: ItemApi }[])),
      );
      for (const r of reintento.flat()) {
        if (r.code === 200 && r.body && !leidos.has(r.body.id)) {
          items.push(r.body);
          leidos.add(r.body.id);
        }
      }
      fallidos = ids.filter((id) => !leidos.has(id));
    }

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

    // Solo se reemplazan las publicaciones que SÍ se leyeron; las fallidas
    // conservan su copia anterior. Antes de borrar se respalda lo que había:
    // si el insert nuevo falla, se restaura (antes, un insert fallido dejaba
    // las publicaciones borradas y "desaparecían" del sistema).
    const idsLeidos = Array.from(leidos);
    const { data: respaldo } = await supabase.from("mercadolibre_publicaciones").select("*").in("item_id", idsLeidos).returns<Record<string, unknown>[]>();
    const { error: errorBorrar } = await supabase.from("mercadolibre_publicaciones").delete().in("item_id", idsLeidos);
    if (errorBorrar) throw new Error(errorBorrar.message);
    if (filas.length) {
      let { error } = await supabase.from("mercadolibre_publicaciones").insert(filas);
      if (error && COLUMNAS_0040.some((c) => error!.message.includes(c))) {
        // SQL 0040 sin correr: se reintenta sin las columnas nuevas.
        const sinNuevas = filas.map((f) => Object.fromEntries(Object.entries(f).filter(([k]) => !COLUMNAS_0040.includes(k))));
        ({ error } = await supabase.from("mercadolibre_publicaciones").insert(sinNuevas));
      }
      if (error) {
        if (respaldo?.length) await supabase.from("mercadolibre_publicaciones").insert(respaldo);
        throw new Error(`No se pudo guardar el lote (se restauró la copia anterior): ${error.message}`);
      }
    }
    // Foto para el Análisis de venta (migración 0046). Si falla (ej. SQL sin
    // correr), no detiene la sincronización.
    try {
      await registrarFotoPublicaciones(filas);
    } catch {
      // se ignora a propósito
    }
    if (fallidos.length) {
      await supabase.from("mercadolibre_sync").upsert({ id: 1, ultimo_error_stock: `${fallidos.length} publicación(es) no se pudieron leer de ML en el último lote (se conservó su copia anterior): ${fallidos.slice(0, 5).join(", ")}${fallidos.length > 5 ? "…" : ""}` });
    }
    return { renglones: filas.length, fallidos };
  } catch (e) {
    const crudo = e instanceof Error ? e.message : "Error desconocido";
    // "TypeError: fetch failed" = Mercado Libre no contestó (falla de red
    // pasajera entre Vercel y ML); se reintenta sola en la siguiente pasada.
    const mensaje = /fetch failed/i.test(crudo) ? "Mercado Libre no contestó en la última pasada (falla de red pasajera); se conservó la copia anterior y se reintenta en la siguiente actualización." : crudo;
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
 * (ML ya no las tiene) y marca la sincronización como terminada.
 * `conservarNoVistas` = true cuando algún lote falló: entonces NO se borra
 * nada (lo que no se vio puede ser una publicación que ML sí tiene). */
export async function terminarSyncPublicaciones(inicioIso?: string, conservarNoVistas = false) {
  const supabase = createServiceClient();
  if (inicioIso && !conservarNoVistas) await supabase.from("mercadolibre_publicaciones").delete().lt("actualizado_en", inicioIso);
  await supabase.from("mercadolibre_sync").upsert({ id: 1, ultima_sync_stock: new Date().toISOString(), ...(conservarNoVistas ? {} : { ultimo_error_stock: null }) });
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
  /** Publicaciones que no se pudieron leer en esta pasada (no se borran). */
  fallidos?: number;
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
    const lote: string[] = cursor.ids.slice(cursor.indice, cursor.indice + TAMANO_LOTE_AUTO);
    let fallidosLote: number = lote.length;
    try {
      const r: { renglones: number; fallidos: string[] } = await sincronizarLotePublicaciones(lote);
      fallidosLote = r.fallidos.length;
    } catch {
      // el lote completo falló: se conserva su copia anterior y se sigue
    }
    cursor = { ...cursor, indice: cursor.indice + TAMANO_LOTE_AUTO, fallidos: (cursor.fallidos ?? 0) + fallidosLote };
    await guardarCursor(cursor);
  }

  if (cursor.indice >= cursor.ids.length) {
    await terminarSyncPublicaciones(cursor.inicio, (cursor.fallidos ?? 0) > 0);
    await guardarCursor(null);
    return { estado: "termino" as const, procesadas: cursor.ids.length, total: cursor.ids.length };
  }
  return { estado: "avanzo" as const, procesadas: Math.min(cursor.indice, cursor.ids.length), total: cursor.ids.length };
}

/** Qué publicaciones tiene Mercado Libre que el CRM no (y al revés). Para
 * el botón "Revisar contra Mercado Libre" (14 oct). */
export async function compararConMl(): Promise<{ enMl: number; enCrm: number; faltantes: string[]; sobrantes: string[] }> {
  const supabase = createServiceClient();
  const ids = await listarIdsPublicaciones();
  const { data } = await todasLasFilas<{ item_id: string }>((desde, hasta) => supabase.from("mercadolibre_publicaciones").select("item_id", { count: "exact" }).order("id").range(desde, hasta));
  const locales = new Set((data ?? []).map((d) => d.item_id));
  const enMl = new Set(ids);
  return {
    enMl: enMl.size,
    enCrm: locales.size,
    faltantes: ids.filter((id) => !locales.has(id)),
    sobrantes: Array.from(locales).filter((id) => !enMl.has(id)),
  };
}

export interface PublicacionEncontradaMl {
  item_id: string;
  titulo: string | null;
  estado: string | null;
  precio: number | null;
  imagen_url: string | null;
  seller_sku: string | null;
  /** Ya está en la copia local del CRM. */
  enCopia: boolean;
  /** Aviso en lenguaje de Isaac (ej. "Mercado Libre contestó 404", "es de otra cuenta"). */
  nota?: string | null;
  /** Se puede traer al CRM (Mercado Libre sí la devolvió). */
  traible?: boolean;
  /** Si ya está en la copia del CRM: cada variante con su liga actual, para
   * poder ligarla ahí mismo desde el resultado de la búsqueda (20 oct;
   * Isaac: "que me deje ahí mismo, en el mismo botón, ligar este producto a
   * lo que ya está cargado en el CRM"). */
  variantes?: VarianteEncontradaMl[];
}

export interface VarianteEncontradaMl {
  variation_id: number | null;
  variacion: string | null;
  seller_sku: string | null;
  /** Producto del CRM al que resuelve hoy (null = sin ligar). */
  skuCrm: string | null;
  origen: OrigenLiga;
  /** Piezas del CRM por unidad de ML de esa liga (1 si no hay). */
  factor: number;
}

/** Números de publicación escritos en un texto: "MLM2230571531",
 * "#2230571531", "2230571531, 4188608504" (como los lista el panel de Full
 * en "Publicaciones con este producto"). Siempre se devuelven con MLM. */
export function idsPublicacionEnTexto(texto: string): string[] {
  const ids = new Set<string>();
  for (const m of texto.matchAll(/(?<![A-Z0-9])(?:MLM\s*-?\s*)?#?(\d{8,13})(?![0-9])/gi)) ids.add(`MLM${m[1]}`);
  return Array.from(ids);
}

/** Busca publicaciones del vendedor en Mercado Libre por nombre o SKU
 * (búsqueda pública del sitio filtrada por vendedor, que solo lista las
 * activas, + búsqueda del vendedor por SKU). Dice cuáles ya están en la
 * copia local, para traer las que falten. */
export async function buscarPublicacionesEnMl(texto: string, skusCrm: Set<string> = new Set()): Promise<PublicacionEncontradaMl[]> {
  const conexion = await obtenerConexion();
  if (!conexion) throw new Error("Mercado Libre no está conectado.");
  const q = texto.trim();
  if (!q) return [];
  const supabase = createServiceClient();
  const encontrados = new Map<string, PublicacionEncontradaMl>();
  // 0) Por número de publicación (16 oct; Isaac: "los steps no me los
  //    encuentra… te mando el número: #2230571531, #4188608504"): se pide
  //    directo a /items, sin depender del scan ni de la búsqueda pública.
  //    Así se trae una publicación aunque esté pausada, en revisión o el
  //    scan no la haya listado.
  const idsTexto = idsPublicacionEnTexto(q);
  if (idsTexto.length > 0) {
    try {
      const detalle = await mercadolibreGet<{ code: number; body: ItemApi & { message?: string } }[]>(
        `/items?ids=${idsTexto.slice(0, 20).join(",")}&attributes=id,seller_id,title,price,status,thumbnail,seller_custom_field,attributes`,
      );
      for (let i = 0; i < idsTexto.length && i < 20; i++) {
        const d = detalle[i];
        const id = idsTexto[i];
        if (d && d.code === 200 && d.body?.id) {
          const ajena = d.body.seller_id !== undefined && String(d.body.seller_id) !== String(conexion.ml_user_id);
          encontrados.set(d.body.id, {
            item_id: d.body.id,
            titulo: d.body.title ?? null,
            estado: d.body.status ?? null,
            precio: d.body.price ?? null,
            imagen_url: d.body.thumbnail ?? null,
            seller_sku: skuDe(d.body.seller_custom_field, d.body.attributes),
            enCopia: false,
            nota: ajena ? "Esta publicación es de OTRA cuenta de Mercado Libre, no de la conectada." : null,
            traible: !ajena,
          });
        } else {
          const code = d?.code;
          encontrados.set(id, {
            item_id: id,
            titulo: null,
            estado: null,
            precio: null,
            imagen_url: null,
            seller_sku: null,
            enCopia: false,
            nota:
              code === 404
                ? "Mercado Libre dice que no existe una publicación con ese número (404). Revisa el número: debe ser el que aparece en el link de la publicación, después de MLM."
                : code === 403
                  ? "Mercado Libre no deja verla (403): suele ser una publicación de otra cuenta."
                  : `Mercado Libre contestó ${code ?? "sin respuesta"}${d?.body?.message ? `: ${d.body.message}` : ""}.`,
            traible: false,
          });
        }
      }
    } catch (e) {
      for (const id of idsTexto) {
        if (!encontrados.has(id)) encontrados.set(id, { item_id: id, titulo: null, estado: null, precio: null, imagen_url: null, seller_sku: null, enCopia: false, nota: `No se pudo consultar: ${e instanceof Error ? e.message : "error"}`, traible: false });
      }
    }
  }
  // 1) Búsqueda pública del sitio por vendedor (solo activas).
  try {
    const r = await mercadolibreGet<{ results?: { id: string; title?: string; price?: number; thumbnail?: string; status?: string }[] }>(
      `/sites/MLM/search?seller_id=${conexion.ml_user_id}&q=${encodeURIComponent(q)}&limit=50`,
    );
    for (const it of r.results ?? []) {
      if (encontrados.has(it.id)) continue;
      encontrados.set(it.id, { item_id: it.id, titulo: it.title ?? null, estado: it.status ?? "active", precio: it.price ?? null, imagen_url: it.thumbnail ?? null, seller_sku: null, enCopia: false, traible: true });
    }
  } catch {
    // si la búsqueda pública falla, queda la de SKU
  }
  // 2) Búsqueda del vendedor por SKU (cualquier estado).
  try {
    const r = await mercadolibreGet<{ results?: string[] }>(`/users/${conexion.ml_user_id}/items/search?seller_sku=${encodeURIComponent(q)}&limit=50`);
    const ids = (r.results ?? []).filter((id) => !encontrados.has(id));
    if (ids.length) {
      const detalle = await mercadolibreGet<{ code: number; body: ItemApi }[]>(`/items?ids=${ids.slice(0, 20).join(",")}&attributes=id,title,price,status,thumbnail,seller_custom_field,attributes`);
      for (const d of detalle) {
        if (d.code !== 200 || !d.body) continue;
        encontrados.set(d.body.id, { item_id: d.body.id, titulo: d.body.title ?? null, estado: d.body.status ?? null, precio: d.body.price ?? null, imagen_url: d.body.thumbnail ?? null, seller_sku: skuDe(d.body.seller_custom_field, d.body.attributes), enCopia: false, traible: true });
      }
    }
  } catch {
    // sin resultados por SKU
  }
  // 3) La copia local, por título o SKU sin acentos: si ya está en el CRM
  //    con otro nombre, aquí se ve bajo qué título.
  const normalizar = (t: string | null | undefined) => (t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const q2 = normalizar(q);
  type Local = Pick<PublicacionMl, "item_id" | "variation_id" | "titulo" | "variacion" | "estado" | "precio" | "imagen_url" | "seller_sku" | "inventory_id">;
  const [{ data: locales }, vinculosLista] = await Promise.all([
    todasLasFilas<Local>((desde, hasta) =>
      supabase.from("mercadolibre_publicaciones").select("item_id, variation_id, titulo, variacion, estado, precio, imagen_url, seller_sku, inventory_id", { count: "exact" }).order("id").range(desde, hasta),
    ),
    obtenerVinculos().catch(() => [] as VinculoMl[]),
  ]);
  const vinculos = new Map(vinculosLista.map((v) => [claveVinculo(v.item_id, v.variation_id), v.sku_crm]));
  const factores = factoresVinculos(vinculosLista);
  const porItem = new Map<string, Local[]>();
  for (const l of locales ?? []) porItem.set(l.item_id, [...(porItem.get(l.item_id) ?? []), l]);
  for (const l of locales ?? []) {
    if (encontrados.has(l.item_id)) continue;
    const coincideId = idsTexto.includes(l.item_id);
    if (coincideId || normalizar(`${l.titulo ?? ""} ${l.variacion ?? ""} ${l.seller_sku ?? ""} ${l.item_id}`).includes(q2)) {
      const variantes = porItem.get(l.item_id) ?? [l];
      const titulo = variantes.length > 1 ? l.titulo : [l.titulo, l.variacion].filter(Boolean).join(" · ") || null;
      encontrados.set(l.item_id, { item_id: l.item_id, titulo, estado: l.estado, precio: l.precio ?? null, imagen_url: l.imagen_url, seller_sku: l.seller_sku, enCopia: true, traible: true });
    }
  }
  // A todo lo que ya está en el CRM se le anota su liga actual, variante por
  // variante, para ligarla desde el mismo resultado.
  return Array.from(encontrados.values()).map((e) => {
    const variantes = porItem.get(e.item_id);
    return {
      ...e,
      enCopia: Boolean(variantes),
      traible: e.traible ?? true,
      variantes: variantes?.map((v) => {
        const liga = skuCrmDe(v, vinculos, skusCrm);
        return { variation_id: v.variation_id, variacion: v.variacion, seller_sku: v.seller_sku, skuCrm: liga.sku, origen: liga.origen, factor: factorDePublicacion(v.item_id, v.variation_id, factores, v.seller_sku, v.inventory_id) };
      }),
    };
  });
}

export async function obtenerPublicaciones(): Promise<PublicacionMl[]> {
  const supabase = createServiceClient();
  // Tope de 1,000 filas de Supabase (20 oct): Isaac tiene más de 1,000
  // publicaciones/variantes y la lista de Ligar SKUs decía "1000" exactas —
  // las demás no existían para el sistema. Se pagina siempre.
  const { data, error } = await todasLasFilas<PublicacionMl>((desde, hasta) =>
    supabase.from("mercadolibre_publicaciones").select("*", { count: "exact" }).order("titulo").order("id").range(desde, hasta),
  );
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Ligas por publicación + ligas por SKU de ML (como vínculos sintéticos),
 * para que todas las pantallas resuelvan igual con `skuCrmDe`. */
export async function obtenerVinculos(): Promise<VinculoMl[]> {
  const supabase = createServiceClient();
  const [{ data }, ligas, ligasCodigo] = await Promise.all([
    todasLasFilas<VinculoMl>((desde, hasta) => supabase.from("mercadolibre_vinculos").select("*", { count: "exact" }).order("id").range(desde, hasta)),
    obtenerLigasSku(),
    obtenerLigasCodigo(),
  ]);
  return [...(data ?? []), ...vinculosDesdeLigasSku(ligas), ...vinculosDesdeLigasCodigo(ligasCodigo)];
}

export function claveVinculo(itemId: string, variationId: number | null) {
  return `${itemId}|${variationId ?? 0}`;
}

/** SKU del CRM de cada publicación: la liga manual manda; si no hay,
 * coincidencia automática cuando el SKU de ML es igual a un SKU del CRM. */
/** Orden de resolución ÚNICO (21 oct; Isaac: "no es constante ni
 * consistente"): 0) liga por Código ML de Full — un código es un producto
 * físico, así la publicación normal, la de catálogo y el envío a Full caen
 * siempre en el mismo lado; 1) liga de ESA publicación/variante (para lo que
 * no está en Full); 2) liga por SKU de ML; 3) el SKU de ML es igual a uno del
 * CRM. */
export function skuCrmDe(pub: Pick<PublicacionMl, "item_id" | "variation_id" | "seller_sku"> & { inventory_id?: string | null }, vinculos: Map<string, string>, skusCrm: Set<string>) {
  if (pub.inventory_id) {
    const porCodigo = vinculos.get(claveCodigoMl(pub.inventory_id));
    if (porCodigo) return { sku: porCodigo, origen: "codigo" as const };
  }
  const manual = vinculos.get(claveVinculo(pub.item_id, pub.variation_id));
  if (manual) return { sku: manual, origen: "manual" as const };
  const sellerSku = normalizarSellerSku(pub.seller_sku);
  if (sellerSku) {
    const porSku = vinculos.get(claveLigaSku(sellerSku));
    if (porSku) return { sku: porSku, origen: "sku" as const };
    if (skusCrm.has(sellerSku)) return { sku: sellerSku, origen: "auto" as const };
    if (pub.seller_sku && skusCrm.has(pub.seller_sku)) return { sku: pub.seller_sku, origen: "auto" as const };
  }
  return { sku: null, origen: null };
}

export type OrigenLiga = "codigo" | "sku" | "auto" | "manual" | null;

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
      const piezasCrm = p.full_disponible * factorDePublicacion(p.item_id, p.variation_id, factores, p.seller_sku, p.inventory_id);
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
/** Publicaciones + ligas, tal cual vienen de la base. Se puede pedir EN
 * PARALELO con los movimientos de stock (no depende de ellos) y luego
 * armar el resumen con `resumenFullDesde` — así la pantalla no espera dos
 * vueltas seguidas al servidor. Null si ML no está conectado o falla. */
export interface DatosFull {
  publicaciones: PublicacionMl[];
  vinculos: VinculoMl[];
}

export async function cargarDatosFull(): Promise<DatosFull | null> {
  try {
    const [publicaciones, vinculos] = await Promise.all([obtenerPublicaciones(), obtenerVinculos()]);
    if (!publicaciones.length) return null;
    return { publicaciones, vinculos };
  } catch {
    return null;
  }
}

export function resumenFullDesde(datos: DatosFull | null, resumenes: { sku: string; costoPromedio: number }[]): ResumenFull | null {
  if (!datos) return null;
  return resumenFull(
    datos.publicaciones,
    new Map(datos.vinculos.map((v) => [claveVinculo(v.item_id, v.variation_id), v.sku_crm])),
    new Set(resumenes.map((r) => r.sku)),
    new Map(resumenes.map((r) => [r.sku, r.costoPromedio])),
    factoresVinculos(datos.vinculos),
  );
}

export async function obtenerResumenFull(resumenes: { sku: string; costoPromedio: number }[]): Promise<ResumenFull | null> {
  return resumenFullDesde(await cargarDatosFull(), resumenes);
}

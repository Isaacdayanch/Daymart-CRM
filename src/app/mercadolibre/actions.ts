"use server";

import { revalidatePath } from "next/cache";
import { obtenerPerfilActual } from "@/lib/perfil";
import { desconectarMercadoLibre, mercadolibreGet } from "@/lib/mercadolibre-auth";

async function soloDueno() {
  const perfil = await obtenerPerfilActual();
  return perfil?.rol === "dueno";
}

export async function desconectar() {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto." };
  try {
    await desconectarMercadoLibre();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo desconectar." };
  }
  revalidatePath("/mercadolibre/conexion");
  return { error: null };
}

/** Prueba real: le pregunta a Mercado Libre "¿quién soy?" con el token
 * vigente (renovándolo si hace falta). Sirve para confirmar que la conexión
 * de verdad funciona, no solo que está guardada. */
export async function probarConexion() {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto.", resultado: null };
  try {
    const yo = await mercadolibreGet<{ id: number; nickname: string; email?: string; site_id: string }>("/users/me");
    revalidatePath("/mercadolibre/conexion");
    return { error: null, resultado: { id: yo.id, nickname: yo.nickname, sitio: yo.site_id } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falló la prueba.", resultado: null };
  }
}

/** Una página de ventas (50 órdenes). La pantalla la llama en tandas hasta
 * que `siguiente` sea null — así nunca se pasa del tiempo máximo de Vercel. */
export async function sincronizarVentasPagina(opciones: { diasAtras?: number; offset?: number; desdeIso?: string; hastaIso?: string }) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto.", guardadas: 0, siguiente: null, total: null, desdeIso: "", hastaIso: undefined };
  try {
    const { sincronizarPaginaOrdenes, procesarNotificacionesPendientes } = await import("@/lib/mercadolibre-ordenes");
    if (!opciones.offset) await procesarNotificacionesPendientes();
    const r = await sincronizarPaginaOrdenes(opciones);
    if (r.siguiente === null) revalidatePath("/mercadolibre");
    return { error: null, ...r };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falló la sincronización.", guardadas: 0, siguiente: null, total: null, desdeIso: "", hastaIso: undefined };
  }
}

/** Para Research: el % de comisión real de Mercado Libre (Clásica o
 * Premium) para un precio y categoría. */
export async function porcentajeComisionMl(precio: number, categoriaId: string, tipo: "gold_special" | "gold_pro") {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto.", porcentaje: null };
  const { comisionesMercadoLibre } = await import("@/lib/mercadolibre-simulador");
  try {
    const comisiones = await comisionesMercadoLibre(precio, categoriaId);
    const c = comisiones.find((x) => x.tipoPublicacion === tipo);
    if (!c) return { error: "Mercado Libre no regresó esa comisión.", porcentaje: null };
    const pct = precio > 0 ? (c.monto / precio) * 100 : 0;
    return { error: null, porcentaje: Math.round(pct * 100) / 100, monto: c.monto };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo consultar la comisión.", porcentaje: null };
  }
}

/** Para Research: categoría probable a partir del nombre (cuando el anuncio
 * es de otro vendedor y Mercado Libre no deja leerlo). */
export async function categoriaPorNombreMl(titulo: string) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto.", categoria: null };
  if (!titulo.trim()) return { error: "Escribe primero el nombre del producto.", categoria: null };
  try {
    const { predecirCategoriaMercadoLibre } = await import("@/lib/mercadolibre");
    const categoria = await predecirCategoriaMercadoLibre(titulo);
    if (!categoria) return { error: "Mercado Libre no encontró una categoría para ese nombre.", categoria: null };
    return { error: null, categoria };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo consultar la categoría.", categoria: null };
  }
}

export async function iniciarSyncStock() {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto.", ids: [] as string[], inicioIso: "" };
  try {
    const { listarIdsPublicaciones } = await import("@/lib/mercadolibre-stock");
    // La hora la pone el servidor (no el navegador) para que coincida con
    // `actualizado_en` de las filas y se puedan borrar las que ya no existen.
    const inicioIso = new Date().toISOString();
    return { error: null, ids: await listarIdsPublicaciones(), inicioIso };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudieron listar las publicaciones.", ids: [] as string[], inicioIso: "" };
  }
}

export async function sincronizarLoteStock(ids: string[]) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto.", renglones: 0 };
  try {
    const { sincronizarLotePublicaciones } = await import("@/lib/mercadolibre-stock");
    return { error: null, renglones: await sincronizarLotePublicaciones(ids) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falló la sincronización.", renglones: 0 };
  }
}

export async function terminarSyncStock(inicioIso?: string) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto." };
  const { terminarSyncPublicaciones } = await import("@/lib/mercadolibre-stock");
  await terminarSyncPublicaciones(inicioIso);
  revalidatePath("/mercadolibre/stock");
  revalidatePath("/stock");
  revalidatePath("/");
  return { error: null };
}

/** Liga (o cambia la liga de) una publicación de ML con un SKU del CRM. */
export async function vincularPublicacion(itemId: string, variationId: number | null, skuCrm: string) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto." };
  if (!skuCrm) return { error: "Elige el producto del CRM." };
  const { createServiceClient } = await import("@/lib/supabase/servicio");
  const supabase = createServiceClient();
  let consulta = supabase.from("mercadolibre_vinculos").delete().eq("item_id", itemId);
  consulta = variationId === null ? consulta.is("variation_id", null) : consulta.eq("variation_id", variationId);
  await consulta;
  const { error } = await supabase.from("mercadolibre_vinculos").insert({ item_id: itemId, variation_id: variationId, sku_crm: skuCrm });
  if (error) return { error: error.message };
  revalidatePath("/mercadolibre/stock");
  revalidatePath("/stock");
  revalidatePath("/");
  return { error: null };
}

export async function desvincularPublicacion(itemId: string, variationId: number | null) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto." };
  const { createServiceClient } = await import("@/lib/supabase/servicio");
  const supabase = createServiceClient();
  let consulta = supabase.from("mercadolibre_vinculos").delete().eq("item_id", itemId);
  consulta = variationId === null ? consulta.is("variation_id", null) : consulta.eq("variation_id", variationId);
  const { error } = await consulta;
  if (error) return { error: error.message };
  revalidatePath("/mercadolibre/stock");
  revalidatePath("/stock");
  revalidatePath("/");
  return { error: null };
}

// ---- Promociones (escritura en Mercado Libre, siempre confirmada por Isaac).
// El precio base de la publicación NUNCA se cambia desde el CRM: un precio
// más bajo se aplica como promoción (descuento del vendedor o campaña de ML).

export async function promocionesItemMl(itemId: string) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto.", promociones: [] };
  try {
    const { promocionesDeItem } = await import("@/lib/mercadolibre-promociones");
    return { error: null, promociones: await promocionesDeItem(itemId) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudieron consultar las promociones.", promociones: [] };
  }
}

export async function aplicarPromocionesMl(
  solicitudes: { itemId: string; titulo?: string | null; tipo: string; promocionId?: string | null; precioPromo?: number | null; precioBase?: number | null; finFecha?: string | null; modo?: string | null; margenEstimadoPct?: number | null }[],
) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto.", resultados: [] };
  const { aplicarPromocion, isoFechaMx } = await import("@/lib/mercadolibre-promociones");
  const resultados = [];
  // Una por una (máx. 15 por llamada; la pantalla manda tandas) para no
  // pasarse del tiempo de Vercel ni saturar a Mercado Libre.
  for (const s of solicitudes.slice(0, 15)) {
    resultados.push(await aplicarPromocion({ ...s, fin: s.finFecha ? isoFechaMx(s.finFecha, true) : null }));
  }
  revalidatePath("/mercadolibre/promociones");
  revalidatePath("/mercadolibre/stock");
  revalidatePath("/mercadolibre");
  return { error: null, resultados };
}

export async function quitarPromocionMl(s: { itemId: string; titulo?: string | null; tipo: string; promocionId?: string | null; precioBase?: number | null }) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto." };
  const { quitarPromocion } = await import("@/lib/mercadolibre-promociones");
  const r = await quitarPromocion(s);
  revalidatePath("/mercadolibre/promociones");
  revalidatePath("/mercadolibre/stock");
  return { error: r.ok ? null : (r.error ?? "No se pudo quitar.") };
}

export async function deshacerPromocionMl(cambioId: string) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto." };
  try {
    const { deshacerPromocion } = await import("@/lib/mercadolibre-promociones");
    const r = await deshacerPromocion(cambioId);
    revalidatePath("/mercadolibre/promociones");
    revalidatePath("/mercadolibre/stock");
    return { error: r.ok ? null : (r.error ?? "No se pudo quitar la promoción.") };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo quitar la promoción." };
  }
}

export async function guardarMargenMinimoMl(pct: number) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto." };
  if (!Number.isFinite(pct) || pct < 0 || pct >= 90) return { error: "Pon un porcentaje entre 0 y 90." };
  try {
    const { guardarMargenMinimo } = await import("@/lib/mercadolibre-promociones");
    await guardarMargenMinimo(pct);
    revalidatePath("/mercadolibre/promociones");
    revalidatePath("/mercadolibre");
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

// ---- Crear un producto del CRM a partir de una publicación de ML (Fase C) ----

/** Copia la foto de Mercado Libre a nuestro Storage (bucket `productos`)
 * para no depender de que ML la siga sirviendo. Si falla, se usa el link
 * de ML tal cual. */
async function copiarImagenMl(url: string | null, sku: string): Promise<string | null> {
  if (!url) return null;
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return url;
    const tipo = r.headers.get("content-type") ?? "image/jpeg";
    const extension = tipo.includes("png") ? "png" : tipo.includes("webp") ? "webp" : "jpg";
    const datos = await r.arrayBuffer();
    const ruta = `mercadolibre/${sku.replace(/[^A-Za-z0-9_-]/g, "_")}-${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from("productos").upload(ruta, datos, { contentType: tipo });
    if (error) return url;
    return supabase.storage.from("productos").getPublicUrl(ruta).data.publicUrl;
  } catch {
    return url;
  }
}

/** "Nuevo producto con estos datos" desde Publicaciones: crea la ficha en
 * el catálogo con la foto/título de ML, opcionalmente su histórico de
 * stock, y liga la publicación (y las que comparten su stock). */
export async function crearProductoDesdeMl(formData: FormData) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto.", sku: null };
  const t = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const sku = t("sku");
  const nombre = t("nombre");
  const itemId = t("item_id");
  if (!sku || !nombre || !itemId) return { error: "Falta el SKU, el nombre o la publicación.", sku: null };
  const variationId = t("variation_id") ? Number(t("variation_id")) : null;
  let otras: { itemId: string; variationId: number | null }[] = [];
  try {
    otras = JSON.parse(t("otras") ?? "[]");
  } catch {
    otras = [];
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { skusExistentes, guardarEnCatalogo } = await import("@/lib/catalogo");
  const existentes = await skusExistentes(supabase);
  if (existentes.has(sku)) return { error: `El SKU ${sku} ya existe. Si es ese producto, usa "Ligar con producto"; si no, cambia la variante o el SKU.`, sku: null };

  const imagenUrl = await copiarImagenMl(t("imagen_url_ml"), sku);
  const entradas = Number(formData.get("entradas_total")) || 0;
  const salidas = Number(formData.get("salidas_total")) || 0;

  if (entradas > 0) {
    // Con histórico: mismo camino que "+ Agregar producto" en Stock.
    const fd = new FormData();
    fd.set("sku", sku);
    fd.set("nombre", nombre);
    fd.set("bodega_id", t("bodega_id") ?? "");
    fd.set("modo", "INICIAL");
    fd.set("piezas_por_caja", t("piezas_por_caja") ?? "1");
    fd.set("costo_unitario_pesos", t("costo_unitario_pesos") ?? "0");
    fd.set("imagen_url_previa", imagenUrl ?? "");
    fd.set("fecha", t("fecha") ?? "");
    fd.set("entradas_total", String(entradas));
    fd.set("salidas_total", String(salidas));
    if (t("marca_id")) fd.set("marca_id", t("marca_id")!);
    if (t("categoria")) fd.set("categoria", t("categoria")!);
    const { registrarProductoStock } = await import("@/app/stock/actions");
    const r = await registrarProductoStock(fd);
    if (r.error) return { error: r.error, sku: null };
  } else {
    await guardarEnCatalogo(supabase, {
      sku,
      nombre,
      marca_id: t("marca_id"),
      categoria: t("categoria"),
      imagen_url: imagenUrl,
      piezas_por_caja: Number(formData.get("piezas_por_caja")) || 1,
    });
  }

  // Liga la publicación elegida y las que comparten su stock (catálogo).
  const { createServiceClient } = await import("@/lib/supabase/servicio");
  const servicio = createServiceClient();
  for (const v of [{ itemId, variationId }, ...otras]) {
    let borrar = servicio.from("mercadolibre_vinculos").delete().eq("item_id", v.itemId);
    borrar = v.variationId === null ? borrar.is("variation_id", null) : borrar.eq("variation_id", v.variationId);
    await borrar;
    await servicio.from("mercadolibre_vinculos").insert({ item_id: v.itemId, variation_id: v.variationId, sku_crm: sku });
  }
  revalidatePath("/mercadolibre/stock");
  revalidatePath("/mercadolibre/promociones");
  revalidatePath("/stock");
  revalidatePath("/stock/catalogo");
  revalidatePath("/");
  return { error: null, sku };
}

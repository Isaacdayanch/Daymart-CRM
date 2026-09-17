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

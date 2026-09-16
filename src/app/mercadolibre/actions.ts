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
  revalidatePath("/mercadolibre");
  return { error: null };
}

/** Prueba real: le pregunta a Mercado Libre "¿quién soy?" con el token
 * vigente (renovándolo si hace falta). Sirve para confirmar que la conexión
 * de verdad funciona, no solo que está guardada. */
export async function probarConexion() {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto.", resultado: null };
  try {
    const yo = await mercadolibreGet<{ id: number; nickname: string; email?: string; site_id: string }>("/users/me");
    revalidatePath("/mercadolibre");
    return { error: null, resultado: { id: yo.id, nickname: yo.nickname, sitio: yo.site_id } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falló la prueba.", resultado: null };
  }
}

export async function sincronizarVentas(diasAtras?: number) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto.", guardadas: 0 };
  try {
    const { sincronizarOrdenes, procesarNotificacionesPendientes } = await import("@/lib/mercadolibre-ordenes");
    await procesarNotificacionesPendientes();
    const guardadas = await sincronizarOrdenes(diasAtras ? { diasAtras } : {});
    revalidatePath("/mercadolibre/ventas");
    return { error: null, guardadas };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falló la sincronización.", guardadas: 0 };
  }
}

export async function simular(formData: FormData) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto.", comisiones: [], envio: null };
  const { comisionesMercadoLibre, envioMercadoLibre } = await import("@/lib/mercadolibre-simulador");
  const precio = Number(formData.get("precio"));
  const categoriaId = String(formData.get("categoria_id") ?? "").trim();
  const largo = Number(formData.get("largo_cm")) || 0;
  const ancho = Number(formData.get("ancho_cm")) || 0;
  const alto = Number(formData.get("alto_cm")) || 0;
  const pesoKg = Number(formData.get("peso_kg")) || null;
  if (!Number.isFinite(precio) || precio <= 0) return { error: "Pon un precio de venta.", comisiones: [], envio: null };
  if (!categoriaId) return { error: "Falta la categoría de Mercado Libre (pega el link de un producto parecido).", comisiones: [], envio: null };
  try {
    const [comisiones, envio] = await Promise.all([
      comisionesMercadoLibre(precio, categoriaId),
      largo && ancho && alto ? envioMercadoLibre({ precio, largoCm: largo, anchoCm: ancho, altoCm: alto, pesoKg }) : Promise.resolve(null),
    ]);
    return { error: null, comisiones, envio };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo simular.", comisiones: [], envio: null };
  }
}

export async function categoriaDesdeLink(link: string) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto.", datos: null };
  const { extraerItemIdMercadoLibre } = await import("@/lib/mercadolibre");
  const { categoriaDeItem } = await import("@/lib/mercadolibre-simulador");
  const itemId = extraerItemIdMercadoLibre(link);
  if (!itemId) return { error: "No reconocí el link de Mercado Libre.", datos: null };
  try {
    return { error: null, datos: await categoriaDeItem(itemId) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer el producto.", datos: null };
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

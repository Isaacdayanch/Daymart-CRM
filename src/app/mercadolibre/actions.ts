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

export async function sincronizarVentas(diasAtras?: number) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto.", guardadas: 0 };
  try {
    const { sincronizarOrdenes, procesarNotificacionesPendientes } = await import("@/lib/mercadolibre-ordenes");
    await procesarNotificacionesPendientes();
    const guardadas = await sincronizarOrdenes(diasAtras ? { diasAtras } : {});
    revalidatePath("/mercadolibre");
    return { error: null, guardadas };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falló la sincronización.", guardadas: 0 };
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

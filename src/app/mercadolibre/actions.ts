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

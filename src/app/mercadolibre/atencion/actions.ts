"use server";

import { revalidatePath } from "next/cache";
import { obtenerPerfilActual } from "@/lib/perfil";
import { atenderPreguntas, conectarWhatsapp, descartarPregunta, desconectarWhatsapp, guardarLimiteDiario, guardarReglasAtencion, redactarBorrador, responderPregunta } from "@/lib/mercadolibre-preguntas";

async function soloDueno() {
  const perfil = await obtenerPerfilActual();
  return perfil?.rol === "dueno";
}

function mensaje(e: unknown, respaldo: string) {
  return e instanceof Error ? e.message : respaldo;
}

/** Al abrir la bandeja: traer preguntas nuevas y redactar lo que falte. */
export async function actualizarBandeja() {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto." };
  try {
    const r = await atenderPreguntas(45000);
    revalidatePath("/mercadolibre/atencion");
    return { ok: true, ...r };
  } catch (e) {
    return { error: mensaje(e, "No se pudieron traer las preguntas.") };
  }
}

export async function enviarRespuesta(id: number, texto: string) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto." };
  try {
    await responderPregunta(id, texto);
    revalidatePath("/mercadolibre/atencion");
    return { ok: true };
  } catch (e) {
    return { error: mensaje(e, "No se pudo mandar la respuesta.") };
  }
}

export async function volverARedactar(id: number, indicacion: string) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto." };
  try {
    await redactarBorrador(id, indicacion);
    revalidatePath("/mercadolibre/atencion");
    return { ok: true };
  } catch (e) {
    return { error: mensaje(e, "No se pudo redactar.") };
  }
}

export async function descartar(id: number, volver = false) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto." };
  try {
    await descartarPregunta(id, volver);
    revalidatePath("/mercadolibre/atencion");
    return { ok: true };
  } catch (e) {
    return { error: mensaje(e, "No se pudo quitar.") };
  }
}

export async function guardarReglas(formData: FormData) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto." };
  try {
    await guardarReglasAtencion(String(formData.get("reglas") ?? ""));
    revalidatePath("/mercadolibre/atencion");
    return { ok: true };
  } catch (e) {
    return { error: mensaje(e, "No se pudieron guardar las reglas.") };
  }
}

export async function guardarTope(limite: number) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto." };
  try {
    await guardarLimiteDiario(limite);
    revalidatePath("/mercadolibre/atencion");
    return { ok: true };
  } catch (e) {
    return { error: mensaje(e, "No se pudo guardar el tope.") };
  }
}

export async function conectarWhatsappAccion(formData: FormData) {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto." };
  try {
    const telefono = await conectarWhatsapp(String(formData.get("telefono") ?? ""), String(formData.get("apikey") ?? ""));
    revalidatePath("/mercadolibre/atencion");
    return { ok: true, telefono };
  } catch (e) {
    return { error: mensaje(e, "No se pudo conectar WhatsApp.") };
  }
}

export async function desconectarWhatsappAccion() {
  if (!(await soloDueno())) return { error: "Solo el dueño puede hacer esto." };
  await desconectarWhatsapp();
  revalidatePath("/mercadolibre/atencion");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { obtenerPerfilActual } from "@/lib/perfil";
import { sincronizarDineroMp } from "@/lib/mercadopago-dinero";

/** Botón "Traer de Mercado Pago": baja los reportes listos y, si falta, pide
 * uno nuevo (se genera en unos minutos). */
export async function traerDineroMp() {
  const perfil = await obtenerPerfilActual();
  if (perfil?.rol !== "dueno") return { error: "Solo el dueño puede hacer esto." };
  try {
    const r = await sincronizarDineroMp({ forzar: true, presupuestoMs: 45_000 });
    revalidatePath("/mercadolibre/dinero");
    revalidatePath("/mercadolibre");
    return { ok: true, ...r };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo hablar con Mercado Pago." };
  }
}

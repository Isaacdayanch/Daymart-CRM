"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { texto } from "@/lib/form-helpers";
import { obtenerPerfilActual } from "@/lib/perfil";
import type { DecisionDiferencia, MomentoEnvio, PreviaEnvio, ResultadoCaptura } from "@/lib/mercadolibre-envios-full";

async function conSesion() {
  const perfil = await obtenerPerfilActual();
  return Boolean(perfil);
}

function refrescar() {
  revalidatePath("/stock");
  revalidatePath("/stock/full");
  revalidatePath("/stock/movimientos");
  revalidatePath("/mercadolibre/stock");
  revalidatePath("/");
}

export async function confirmarDevolucion(ordenId: number, decision: "REINGRESADA" | "MERMA") {
  if (!(await conSesion())) return { error: "Inicia sesión." };
  const { confirmarDevolucionMl } = await import("@/lib/salidas-ml");
  const r = await confirmarDevolucionMl(ordenId, decision);
  if (!r.error) refrescar();
  return r;
}

/** Interruptor de salidas automáticas por ventas de ML (con fecha de arranque). */
export async function configurarSalidasMl(formData: FormData) {
  if (!(await conSesion())) return { error: "Inicia sesión." };
  const supabase = await createClient();
  const apagar = formData.get("apagar") === "true";
  const desde = texto(formData, "desde");
  if (!apagar && !desde) return { error: "Elige la fecha de arranque." };
  const { error } = await supabase.from("configuracion_stock").update({ salidas_ml_desde: apagar ? null : desde }).eq("id", 1);
  if (error) return { error: error.message };
  if (!apagar) {
    const { procesarVentasMl } = await import("@/lib/salidas-ml");
    await procesarVentasMl();
  }
  refrescar();
  return { error: null };
}

export async function procesarAhora() {
  if (!(await conSesion())) return { error: "Inicia sesión.", generadas: 0 };
  const { procesarVentasMl, registrarHistorialFull } = await import("@/lib/salidas-ml");
  const { generarSalidasPendientesEnvios } = await import("@/lib/mercadolibre-envios-full");
  try {
    await registrarHistorialFull();
    const r = await procesarVentasMl();
    const e = await generarSalidasPendientesEnvios();
    refrescar();
    return { error: null, generadas: r.generadas + e.generadas };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo procesar.", generadas: 0 };
  }
}

// ---- Envíos a Full en dos momentos (migración 0049) ----

const SIN_SESION: ResultadoCaptura = { error: "Inicia sesión.", productos: 0, piezas: 0, sinPublicacion: [], sinLigar: 0, diferencias: 0, cerrado: false };

/** Vista previa: qué leyó el sistema de la tabla pegada y a qué producto cae cada renglón. No guarda nada. */
export async function previsualizarEnvioMl(numero: string, textoPanel: string): Promise<PreviaEnvio> {
  if (!(await conSesion())) return { error: "Inicia sesión.", inboundId: "", lineas: [], faseExistente: null, totalDeclaradas: 0, totalSalen: 0, sinLigar: 0, sinPublicacion: 0 };
  const { previsualizarEnvioDesdePanel } = await import("@/lib/mercadolibre-envios-full");
  return previsualizarEnvioDesdePanel(numero, textoPanel);
}

/** Momento 1 (o los dos juntos): pegar la tabla del panel de ML. */
export async function capturarEnvioMl(numero: string, textoPanel: string, momento: MomentoEnvio, fechaSalida: string | null, bodegaId: string | null): Promise<ResultadoCaptura> {
  if (!(await conSesion())) return SIN_SESION;
  const { capturarEnvioDesdePanel } = await import("@/lib/mercadolibre-envios-full");
  const r = await capturarEnvioDesdePanel(numero, textoPanel, { momento, fechaSalida, bodegaId });
  refrescar();
  return r;
}

/** Momento 2a: ML lo recibió tal como se declaró. */
export async function llegadaCompletaMl(inboundId: string) {
  if (!(await conSesion())) return { error: "Inicia sesión.", regresaron: 0, mermas: 0 };
  const { registrarLlegadaCompleta } = await import("@/lib/mercadolibre-envios-full");
  const r = await registrarLlegadaCompleta(inboundId);
  refrescar();
  return r;
}

/** Momento 2b: ML recibió con diferencias (tabla con "Aptas para Full"). */
export async function llegadaDesdePanelMl(inboundId: string, textoPanel: string) {
  if (!(await conSesion())) return { error: "Inicia sesión.", diferencias: 0, cerrado: false, sinPublicacion: [] as string[] };
  const { registrarLlegadaDesdePanel } = await import("@/lib/mercadolibre-envios-full");
  const r = await registrarLlegadaDesdePanel(inboundId, textoPanel);
  refrescar();
  return r;
}

/** Cerrar el envío con la decisión de cada diferencia. */
export async function cerrarEnvioMl(inboundId: string, decisiones: { lineaId: string; decision: DecisionDiferencia }[]) {
  if (!(await conSesion())) return { error: "Inicia sesión.", regresaron: 0, mermas: 0 };
  const { cerrarEnvioFullMl } = await import("@/lib/mercadolibre-envios-full");
  const r = await cerrarEnvioFullMl(inboundId, decisiones);
  refrescar();
  return r;
}

/** Deshacer por completo (borra sus salidas y el envío). */
export async function deshacerEnvioMl(inboundId: string) {
  if (!(await conSesion())) return { error: "Inicia sesión." };
  const { deshacerEnvioFullMl } = await import("@/lib/mercadolibre-envios-full");
  const r = await deshacerEnvioFullMl(inboundId);
  refrescar();
  return r;
}

/** Envío capturado con el flujo anterior (sin descontar): registrar su salida de bodega. */
export async function registrarSalidaEnvioMl(inboundId: string, fechaSalida: string | null, bodegaId: string | null) {
  if (!(await conSesion())) return { error: "Inicia sesión.", generadas: 0, sinLigar: 0 };
  const { descontarEnvioFullMl, cerrarSiNoHayDiferencias, obtenerEnviosFullMl } = await import("@/lib/mercadolibre-envios-full");
  const r = await descontarEnvioFullMl(inboundId, { fechaSalida, bodegaId });
  if (!r.error) {
    // Si ML ya lo había recibido (flujo viejo, con "Aptas para Full"): se cierra
    // si no hay diferencias; si las hay, Isaac las decide como en cualquier envío.
    const envio = (await obtenerEnviosFullMl()).find((e) => e.envio.inbound_id === inboundId)?.envio;
    if (envio && (envio.estado === "RECIBIDO" || envio.estado === "CONTADO")) await cerrarSiNoHayDiferencias(inboundId);
  }
  refrescar();
  return r;
}

export async function ignorarEnvioMl(inboundId: string) {
  if (!(await conSesion())) return { error: "Inicia sesión." };
  const { ignorarEnvioFullMl } = await import("@/lib/mercadolibre-envios-full");
  const r = await ignorarEnvioFullMl(inboundId);
  refrescar();
  return r;
}

/** Una subida en Full sin envío que la explique: no fue de la bodega (ej. devolución a Full). */
export async function ignorarRecepcionMl(recepcionId: string) {
  if (!(await conSesion())) return { error: "Inicia sesión." };
  const { ignorarRecepcionFull } = await import("@/lib/mercadolibre-envios-full");
  const r = await ignorarRecepcionFull(recepcionId);
  refrescar();
  return r;
}

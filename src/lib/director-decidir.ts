// Registrar decisiones de Isaac sobre las propuestas del Director desde
// fuera de la pantalla (chat con el Director, WhatsApp) y ejecutar en
// Mercado Libre lo aprobado con acción automática. Lo comparten
// `/api/director/decisiones` y el webhook de WhatsApp.

import { createServiceClient } from "@/lib/supabase/servicio";
import { ACCIONES_DIRECTOR, mensajeErrorDirector, resumenPropuesta } from "@/lib/director";
import { ejecutarAprobadas, type ResultadoEjecucion } from "@/lib/director-ejecutar";
import type { PropuestaDirector } from "@/lib/tipos";

export interface DecisionExterna {
  id?: string;
  /** Número del día (el que Isaac ve en la lista). */
  orden?: number;
  decision: "APROBAR" | "RECHAZAR";
  precio?: number | null;
  nota?: string | null;
}

export interface ResultadoDecisiones {
  decididas: string[];
  aprobadas: number;
  rechazadas: number;
  ignoradas: string[];
  ejecucion: ResultadoEjecucion[];
  error_ejecucion?: string;
}

/** Propuestas que siguen esperando decisión (las más nuevas primero). */
export async function propuestasPendientes(): Promise<PropuestaDirector[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("director_propuestas").select("*").eq("estado", "PROPUESTA").order("fecha", { ascending: false }).order("orden").returns<PropuestaDirector[]>();
  if (error) throw new Error(mensajeErrorDirector(error));
  return data ?? [];
}

/** Aplica las decisiones (por id o por número del día más reciente con
 * pendientes), anota la bitácora y ejecuta en ML lo aprobado automático. */
export async function registrarDecisiones(decisiones: DecisionExterna[], desde: "CHAT" | "WHATSAPP"): Promise<ResultadoDecisiones> {
  const supabase = createServiceClient();
  const ahora = new Date().toISOString();
  const resultado: ResultadoDecisiones = { decididas: [], aprobadas: 0, rechazadas: 0, ignoradas: [], ejecucion: [] };
  if (!decisiones.length) return resultado;
  const pendientes = await propuestasPendientes();
  const hoy = pendientes.length ? pendientes.reduce((max, p) => (p.fecha > max ? p.fecha : max), pendientes[0].fecha) : null;
  const aEjecutar: string[] = [];

  for (const d of decisiones) {
    const estado = d.decision === "APROBAR" ? "APROBADA" : d.decision === "RECHAZAR" ? "RECHAZADA" : null;
    const etiqueta = String(d.id ?? d.orden);
    if (!estado) {
      resultado.ignoradas.push(`${etiqueta}: decisión inválida (APROBAR | RECHAZAR)`);
      continue;
    }
    const p = typeof d.id === "string" ? pendientes.find((x) => x.id === d.id) : pendientes.find((x) => x.fecha === hoy && x.orden === Number(d.orden));
    if (!p) {
      resultado.ignoradas.push(`${etiqueta}: no hay propuesta pendiente con ese id/número`);
      continue;
    }
    const precio = d.precio === null || d.precio === undefined ? null : Number(d.precio);
    if (precio !== null && (!Number.isFinite(precio) || precio < 0)) {
      resultado.ignoradas.push(`${etiqueta}: precio inválido`);
      continue;
    }
    const nota = typeof d.nota === "string" ? d.nota.slice(0, 500) : null;
    const { error } = await supabase
      .from("director_propuestas")
      .update({ estado, precio_aprobado: estado === "APROBADA" ? precio : null, nota_isaac: nota, decidido_en: ahora, decidido_desde: desde === "WHATSAPP" ? "CHAT" : desde })
      .eq("id", p.id)
      .eq("estado", "PROPUESTA");
    if (error) throw new Error(mensajeErrorDirector(error));
    await supabase.from("director_bitacora").insert({
      origen: "ISAAC",
      accion: d.decision,
      propuesta_id: p.id,
      detalle: { desde, precio, nota },
      resultado: resumenPropuesta({ ...p, precio_aprobado: precio }),
    });
    resultado.decididas.push(p.id);
    if (estado === "APROBADA") {
      resultado.aprobadas++;
      if (ACCIONES_DIRECTOR[p.accion_tipo]?.automatica) aEjecutar.push(p.id);
    } else resultado.rechazadas++;
  }

  if (aEjecutar.length) {
    try {
      resultado.ejecucion = await ejecutarAprobadas({ ids: aEjecutar });
    } catch (e) {
      resultado.error_ejecucion = e instanceof Error ? e.message : "No se pudieron ejecutar en Mercado Libre.";
    }
  }
  return resultado;
}

/** Resumen corto (para WhatsApp) de lo que quedó. */
export function textoResultadoDecisiones(r: ResultadoDecisiones) {
  const partes: string[] = [];
  if (r.aprobadas) partes.push(`✅ ${r.aprobadas} aprobada${r.aprobadas === 1 ? "" : "s"}`);
  if (r.rechazadas) partes.push(`✖️ ${r.rechazadas} rechazada${r.rechazadas === 1 ? "" : "s"}`);
  const ok = r.ejecucion.filter((e) => e.ok);
  const mal = r.ejecucion.filter((e) => !e.ok);
  if (ok.length) partes.push(`⚡ ${ok.length} ya aplicada${ok.length === 1 ? "" : "s"} en Mercado Libre`);
  for (const e of mal) partes.push(`⚠️ #${e.orden} falló: ${e.error ?? "sin detalle"}`);
  if (r.error_ejecucion) partes.push(`⚠️ No se pudo aplicar en ML: ${r.error_ejecucion}`);
  for (const i of r.ignoradas) partes.push(`· ${i}`);
  return partes.length ? partes.join("\n") : "No había nada pendiente que decidir.";
}

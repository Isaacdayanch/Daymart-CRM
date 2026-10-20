"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenerPerfilActual } from "@/lib/perfil";
import { mensajeErrorDirector, resumenPropuesta } from "@/lib/director";
import type { PropuestaDirector } from "@/lib/tipos";

async function esDueno() {
  const perfil = await obtenerPerfilActual();
  return perfil?.rol === "dueno";
}

function refrescar() {
  revalidatePath("/director");
  revalidatePath("/");
}

export interface DecisionPantalla {
  id: string;
  decision: "APROBAR" | "RECHAZAR";
  /** Precio que Isaac quiere (solo si lo cambió); null = el propuesto. */
  precio?: number | null;
  nota?: string | null;
}

/** Isaac decide desde la pantalla, varias de un jalón ("todas menos estas").
 * Solo toca propuestas que siguen en PROPUESTA; cada decisión queda en la
 * bitácora con origen ISAAC. */
export async function decidirPropuestas(decisiones: DecisionPantalla[]) {
  if (!(await esDueno())) return { error: "Solo el dueño puede decidir las propuestas del Director." };
  if (!decisiones.length) return { error: "No hay nada que decidir." };
  const supabase = await createClient();
  const ahora = new Date().toISOString();
  let aprobadas = 0;
  let rechazadas = 0;
  for (const d of decisiones) {
    const estado = d.decision === "APROBAR" ? "APROBADA" : "RECHAZADA";
    const precio = d.precio === null || d.precio === undefined || !Number.isFinite(d.precio) ? null : d.precio;
    if (precio !== null && precio < 0) return { error: "Un precio no puede ser negativo." };
    const { data, error } = await supabase
      .from("director_propuestas")
      .update({ estado, precio_aprobado: estado === "APROBADA" ? precio : null, nota_isaac: d.nota?.trim() || null, decidido_en: ahora, decidido_desde: "CRM" })
      .eq("id", d.id)
      .eq("estado", "PROPUESTA")
      .select("*")
      .returns<PropuestaDirector[]>();
    if (error) return { error: mensajeErrorDirector(error) };
    const p = data?.[0];
    if (!p) continue;
    if (estado === "APROBADA") aprobadas++;
    else rechazadas++;
    await supabase.from("director_bitacora").insert({
      origen: "ISAAC",
      accion: d.decision,
      propuesta_id: p.id,
      detalle: { desde: "CRM", precio, nota: d.nota ?? null },
      resultado: resumenPropuesta(p),
    });
  }
  refrescar();
  return { ok: true, aprobadas, rechazadas };
}

/** Fase 1: una propuesta aprobada se ejecuta a mano (Isaac la hace en ML o en
 * el panel) y aquí la marca como hecha. En la fase 2 el CRM ejecutará solo
 * las que tengan `accion_tipo` automático. */
export async function marcarHecha(id: string, formData: FormData) {
  if (!(await esDueno())) return { error: "Solo el dueño puede marcar propuestas." };
  const nota = String(formData.get("resultado") ?? "").trim();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("director_propuestas")
    .update({ estado: "EJECUTADA", ejecutado_en: new Date().toISOString(), resultado: nota || "Hecha a mano por Isaac." })
    .eq("id", id)
    .eq("estado", "APROBADA")
    .select("*")
    .returns<PropuestaDirector[]>();
  if (error) return { error: mensajeErrorDirector(error) };
  const p = data?.[0];
  if (!p) return { error: "Esa propuesta ya no está aprobada (quizá ya se marcó)." };
  await supabase.from("director_bitacora").insert({ origen: "ISAAC", accion: "HECHA_A_MANO", propuesta_id: p.id, detalle: { nota }, resultado: resumenPropuesta(p) });
  refrescar();
  return { ok: true };
}

/** Regresar una decisión (se equivocó de botón): vuelve a PROPUESTA mientras
 * no se haya ejecutado. */
export async function deshacerDecision(id: string) {
  if (!(await esDueno())) return { error: "Solo el dueño puede cambiar decisiones." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("director_propuestas")
    .update({ estado: "PROPUESTA", precio_aprobado: null, decidido_en: null, decidido_desde: null, nota_isaac: null })
    .eq("id", id)
    .in("estado", ["APROBADA", "RECHAZADA"])
    .select("*")
    .returns<PropuestaDirector[]>();
  if (error) return { error: mensajeErrorDirector(error) };
  const p = data?.[0];
  if (!p) return { error: "Esa propuesta ya se ejecutó o ya no se puede regresar." };
  await supabase.from("director_bitacora").insert({ origen: "ISAAC", accion: "DESHACER_DECISION", propuesta_id: p.id, detalle: {}, resultado: resumenPropuesta(p) });
  refrescar();
  return { ok: true };
}

// Versiones para `<form action>` (deben devolver void). Si algo falla, el
// error queda en la bitácora del servidor y la pantalla simplemente no cambia.
export async function marcarHechaForm(id: string, formData: FormData) {
  const r = await marcarHecha(id, formData);
  if ("error" in r && r.error) console.error("[director] marcarHecha:", r.error);
}

export async function deshacerDecisionForm(id: string) {
  const r = await deshacerDecision(id);
  if ("error" in r && r.error) console.error("[director] deshacerDecision:", r.error);
}

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/servicio";
import { mensajeErrorDirector } from "@/lib/director";
import { registrarDecisiones, type DecisionExterna, type ResultadoDecisiones } from "@/lib/director-decidir";
import { autorizadoDirector, leerJson, noAutorizado } from "../_comun";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Tres usos, en un solo cuerpo:
 * 1) `decisiones`: Isaac contestó en el CHAT ("va menos el 4, la olla a 1,990")
 *    y el Director lo registra aquí para que el CRM sea la única fuente:
 *    `[{ id | orden, decision: "APROBAR" | "RECHAZAR", precio?, nota? }]`
 *    (`orden` = número del día; `id` manda si vienen los dos). Lo aprobado
 *    con acción automática se ejecuta en ML en el acto (`ejecucion[]`).
 * 2) `reportadas`: ids de propuestas cuya decisión/ejecución el Director ya
 *    le contó a Isaac (se marca `reportada_en` para no repetirlo mañana).
 * 3) `mensajes_atendidos`: ids de órdenes de WhatsApp que el Director ya
 *    atendió (se marca `atendido_en`).
 * Solo se puede decidir sobre propuestas en estado PROPUESTA. */
export async function POST(request: NextRequest) {
  if (!autorizadoDirector(request)) return noAutorizado();
  const cuerpo = await leerJson(request);
  if (!cuerpo) return NextResponse.json({ error: "El cuerpo debe ser JSON." }, { status: 400 });
  const supabase = createServiceClient();
  const ahora = new Date().toISOString();
  let resultado: ResultadoDecisiones & { reportadas: number; mensajes_atendidos: number } = { decididas: [], aprobadas: 0, rechazadas: 0, ignoradas: [], ejecucion: [], reportadas: 0, mensajes_atendidos: 0 };

  try {
    const crudas = Array.isArray(cuerpo.decisiones) ? (cuerpo.decisiones as Record<string, unknown>[]) : [];
    const decisiones: DecisionExterna[] = crudas.map((d) => ({
      id: typeof d.id === "string" ? d.id : undefined,
      orden: d.orden === undefined || d.orden === null || d.orden === "" ? undefined : Number(d.orden),
      decision: d.decision === "APROBAR" ? "APROBAR" : d.decision === "RECHAZAR" ? "RECHAZAR" : ("INVALIDA" as unknown as "APROBAR"),
      precio: d.precio === null || d.precio === undefined || d.precio === "" ? null : Number(d.precio),
      nota: typeof d.nota === "string" ? d.nota : null,
    }));
    if (decisiones.length) resultado = { ...resultado, ...(await registrarDecisiones(decisiones, "CHAT")) };

    const reportadas = Array.isArray(cuerpo.reportadas) ? (cuerpo.reportadas as unknown[]).filter((x): x is string => typeof x === "string") : [];
    if (reportadas.length) {
      const { data, error } = await supabase.from("director_propuestas").update({ reportada_en: ahora }).in("id", reportadas).is("reportada_en", null).select("id");
      if (error) throw new Error(mensajeErrorDirector(error));
      resultado.reportadas = data?.length ?? 0;
    }

    const mensajes = Array.isArray(cuerpo.mensajes_atendidos) ? (cuerpo.mensajes_atendidos as unknown[]).filter((x): x is string => typeof x === "string") : [];
    if (mensajes.length) {
      const { data, error } = await supabase.from("director_mensajes").update({ atendido_en: ahora }).in("id", mensajes).is("atendido_en", null).select("id");
      if (error) throw new Error(mensajeErrorDirector(error));
      resultado.mensajes_atendidos = data?.length ?? 0;
    }

    revalidatePath("/director");
    revalidatePath("/mercadolibre/promociones");
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudieron registrar las decisiones." }, { status: 500 });
  }
}

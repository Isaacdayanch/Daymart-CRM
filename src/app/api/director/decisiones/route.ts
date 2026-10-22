import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/servicio";
import { mensajeErrorDirector, resumenPropuesta } from "@/lib/director";
import type { PropuestaDirector } from "@/lib/tipos";
import { anotarBitacora, autorizadoDirector, leerJson, noAutorizado } from "../_comun";

export const dynamic = "force-dynamic";

/** Dos usos, en un solo cuerpo:
 * 1) `decisiones`: Isaac contestó en el CHAT ("va menos el 4, la olla a 1,990")
 *    y el Director lo registra aquí para que el CRM sea la única fuente:
 *    `[{ id | orden, decision: "APROBAR" | "RECHAZAR", precio?, nota? }]`
 *    (`orden` = número del día de hoy; `id` manda si vienen los dos).
 * 2) `reportadas`: ids de propuestas cuya decisión/ejecución el Director ya
 *    le contó a Isaac (se marca `reportada_en` para no repetirlo mañana).
 * Solo se puede decidir sobre propuestas en estado PROPUESTA. */
export async function POST(request: NextRequest) {
  if (!autorizadoDirector(request)) return noAutorizado();
  const cuerpo = await leerJson(request);
  if (!cuerpo) return NextResponse.json({ error: "El cuerpo debe ser JSON." }, { status: 400 });
  const supabase = createServiceClient();
  const ahora = new Date().toISOString();
  const resultado: { decididas: string[]; ignoradas: string[]; reportadas: number } = { decididas: [], ignoradas: [], reportadas: 0 };

  try {
    const decisiones = Array.isArray(cuerpo.decisiones) ? (cuerpo.decisiones as Record<string, unknown>[]) : [];
    if (decisiones.length) {
      const { data: pendientes, error } = await supabase.from("director_propuestas").select("*").eq("estado", "PROPUESTA").returns<PropuestaDirector[]>();
      if (error) throw new Error(mensajeErrorDirector(error));
      const hoy = pendientes?.length ? pendientes.reduce((max, p) => (p.fecha > max ? p.fecha : max), pendientes[0].fecha) : null;
      for (const d of decisiones) {
        const decision = d.decision === "APROBAR" ? "APROBADA" : d.decision === "RECHAZAR" ? "RECHAZADA" : null;
        if (!decision) {
          resultado.ignoradas.push(`${String(d.id ?? d.orden)}: decisión inválida (APROBAR | RECHAZAR)`);
          continue;
        }
        const p = typeof d.id === "string" ? pendientes?.find((x) => x.id === d.id) : pendientes?.find((x) => x.fecha === hoy && x.orden === Number(d.orden));
        if (!p) {
          resultado.ignoradas.push(`${String(d.id ?? d.orden)}: no hay propuesta pendiente con ese id/número`);
          continue;
        }
        const precio = d.precio === null || d.precio === undefined || d.precio === "" ? null : Number(d.precio);
        if (precio !== null && (!Number.isFinite(precio) || precio < 0)) {
          resultado.ignoradas.push(`${String(d.id ?? d.orden)}: precio inválido`);
          continue;
        }
        const nota = typeof d.nota === "string" ? d.nota.slice(0, 500) : null;
        const { error: errorUpd } = await supabase
          .from("director_propuestas")
          .update({ estado: decision, precio_aprobado: decision === "APROBADA" ? precio : null, nota_isaac: nota, decidido_en: ahora, decidido_desde: "CHAT" })
          .eq("id", p.id)
          .eq("estado", "PROPUESTA");
        if (errorUpd) throw new Error(mensajeErrorDirector(errorUpd));
        await anotarBitacora({ origen: "ISAAC", accion: decision === "APROBADA" ? "APROBAR" : "RECHAZAR", propuesta_id: p.id, detalle: { desde: "CHAT", precio, nota }, resultado: resumenPropuesta({ ...p, precio_aprobado: precio }) });
        resultado.decididas.push(p.id);
      }
    }

    const reportadas = Array.isArray(cuerpo.reportadas) ? (cuerpo.reportadas as unknown[]).filter((x): x is string => typeof x === "string") : [];
    if (reportadas.length) {
      const { data, error } = await supabase.from("director_propuestas").update({ reportada_en: ahora }).in("id", reportadas).is("reportada_en", null).select("id");
      if (error) throw new Error(mensajeErrorDirector(error));
      resultado.reportadas = data?.length ?? 0;
    }

    revalidatePath("/director");
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudieron registrar las decisiones." }, { status: 500 });
  }
}

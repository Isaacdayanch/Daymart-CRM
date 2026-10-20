import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { anotarBitacora, autorizadoDirector, leerJson, noAutorizado } from "../_comun";

export const dynamic = "force-dynamic";

/** El Director anota en la bitácora del CRM (en vez de en un archivo del
 * repositorio): la corrida de la mañana, qué ejecutó, errores, "pedir al
 * programador". Cuerpo: `{ accion: string, detalle?: object, resultado?:
 * string, error?: string, propuesta_id?: string }`. */
export async function POST(request: NextRequest) {
  if (!autorizadoDirector(request)) return noAutorizado();
  const cuerpo = await leerJson(request);
  const accion = cuerpo && typeof cuerpo.accion === "string" ? cuerpo.accion.trim().slice(0, 80) : "";
  if (!accion) return NextResponse.json({ error: "Falta «accion» (texto corto, ej. CORRIDA_MANANA)." }, { status: 400 });
  try {
    await anotarBitacora({
      origen: "DIRECTOR",
      accion,
      propuesta_id: typeof cuerpo!.propuesta_id === "string" ? cuerpo!.propuesta_id : null,
      detalle: cuerpo!.detalle && typeof cuerpo!.detalle === "object" && !Array.isArray(cuerpo!.detalle) ? (cuerpo!.detalle as Record<string, unknown>) : {},
      resultado: typeof cuerpo!.resultado === "string" ? cuerpo!.resultado.slice(0, 2000) : null,
      error: typeof cuerpo!.error === "string" ? cuerpo!.error.slice(0, 2000) : null,
    });
    revalidatePath("/director");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo anotar en la bitácora." }, { status: 500 });
  }
}

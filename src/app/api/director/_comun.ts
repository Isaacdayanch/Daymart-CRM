import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/servicio";
import { mensajeErrorDirector } from "@/lib/director";

/** Lo que comparten las puertas del Director (`/api/director/*`): la clave
 * secreta DIRECTOR_SECRET (por `?clave=` o `Authorization: Bearer`), el
 * cliente con service role (quien llama es un programa, sin sesión) y la
 * bitácora. Nunca se usa desde el navegador. */
export function autorizadoDirector(request: NextRequest) {
  const secreto = process.env.DIRECTOR_SECRET;
  if (!secreto) return false;
  const clave = request.nextUrl.searchParams.get("clave");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return clave === secreto || bearer === secreto;
}

export function noAutorizado() {
  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}

export async function leerJson(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const cuerpo = await request.json();
    return cuerpo && typeof cuerpo === "object" && !Array.isArray(cuerpo) ? (cuerpo as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function anotarBitacora(entrada: { origen: "DIRECTOR" | "ISAAC" | "CRM"; accion: string; propuesta_id?: string | null; detalle?: Record<string, unknown>; resultado?: string | null; error?: string | null }) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("director_bitacora").insert({
    origen: entrada.origen,
    accion: entrada.accion,
    propuesta_id: entrada.propuesta_id ?? null,
    detalle: entrada.detalle ?? {},
    resultado: entrada.resultado ?? null,
    error: entrada.error ?? null,
  });
  if (error) throw new Error(mensajeErrorDirector(error));
}

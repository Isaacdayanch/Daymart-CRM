import { NextRequest, NextResponse } from "next/server";
import { cargarDatosDirector } from "@/lib/director-datos";
import { autorizadoDirector, noAutorizado } from "./_comun";

/** Puerta de SOLO LECTURA para el "Director" como agente de Claude Code.
 *
 * Mismo patrón que `/api/respaldo`: quien llama es un programa, no un
 * navegador con sesión, así que la única puerta es la clave secreta
 * `DIRECTOR_SECRET` (variable de entorno en Vercel). Usa la service role
 * key del lado del servidor y NUNCA debe reutilizarse para nada que el
 * navegador toque. No escribe nada: el Director propone, Isaac decide.
 * El cálculo vive en `src/lib/director-datos.ts` (lo comparte con el chat
 * del Director dentro del CRM). */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!autorizadoDirector(request)) return noAutorizado();
  return NextResponse.json(await cargarDatosDirector());
}

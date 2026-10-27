import { NextRequest, NextResponse } from "next/server";
import { guardarPropuestas } from "@/lib/director-propuestas";
import { autorizadoDirector, leerJson, noAutorizado } from "../_comun";

export const dynamic = "force-dynamic";

/** El Director (agente de Claude Code) mete sus propuestas del día. Cuerpo:
 * `{ lote?: string, propuestas: [{ area, titulo, detalle?, porque?, datos?,
 *    accion_tipo?, item_id?, sku_crm?, imagen_url?, precio_propuesto? }],
 *    caducar_anteriores?: boolean (true por defecto) }`.
 * Devuelve cada propuesta con su id y su número, y el link de la pantalla.
 * El trabajo vive en `src/lib/director-propuestas.ts` (lo comparte con el
 * chat del Director dentro del CRM). */
export async function POST(request: NextRequest) {
  if (!autorizadoDirector(request)) return noAutorizado();
  const cuerpo = await leerJson(request);
  if (!cuerpo) return NextResponse.json({ error: "El cuerpo debe ser JSON con «propuestas»." }, { status: 400 });
  try {
    const r = await guardarPropuestas(cuerpo.propuestas, { lote: typeof cuerpo.lote === "string" ? cuerpo.lote : null, caducarAnteriores: cuerpo.caducar_anteriores !== false });
    return NextResponse.json({ ok: true, ...r, pantalla: "https://daymart-crm.vercel.app/director" });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudieron guardar las propuestas.";
    return NextResponse.json({ error: mensaje }, { status: /lista|título|área|accion_tipo|precio|objeto/i.test(mensaje) ? 400 : 500 });
  }
}

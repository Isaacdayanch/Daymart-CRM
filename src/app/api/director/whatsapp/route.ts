import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/servicio";
import { enviarWhatsapp, whatsappConfigurado } from "@/lib/whatsapp-director";
import { autorizadoDirector, leerJson, noAutorizado } from "../_comun";

export const dynamic = "force-dynamic";

/** El Director le manda un WhatsApp a Isaac (el mensaje de la mañana, un
 * aviso). Cuerpo: `{ "texto": "…" }`. Queda guardado en `director_mensajes`
 * como SALIDA. Si Meta no acepta texto libre (fuera de la ventana de 24 h)
 * y hay plantilla, va como plantilla. */
export async function POST(request: NextRequest) {
  if (!autorizadoDirector(request)) return noAutorizado();
  if (!whatsappConfigurado()) return NextResponse.json({ ok: false, error: "WhatsApp no está configurado en Vercel (WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_ISAAC)." }, { status: 400 });
  const cuerpo = await leerJson(request);
  const texto = cuerpo && typeof cuerpo.texto === "string" ? cuerpo.texto.trim() : "";
  if (!texto) return NextResponse.json({ error: "Falta «texto»." }, { status: 400 });
  const r = await enviarWhatsapp(texto);
  const supabase = createServiceClient();
  await supabase.from("director_mensajes").insert({ direccion: "SALIDA", de: "DIRECTOR", texto, tipo: "AVISO", interpretacion: { viaPlantilla: r.viaPlantilla ?? false }, error: r.ok ? null : r.error ?? null, atendido_en: new Date().toISOString() });
  return NextResponse.json(r.ok ? { ok: true, id: r.id, viaPlantilla: r.viaPlantilla ?? false } : { ok: false, error: r.error }, { status: r.ok ? 200 : 502 });
}

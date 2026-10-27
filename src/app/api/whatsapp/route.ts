import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/servicio";
import { propuestasPendientes, registrarDecisiones, textoResultadoDecisiones } from "@/lib/director-decidir";
import { enviarWhatsapp, esIsaac, interpretarMensaje, textoPendientes } from "@/lib/whatsapp-director";
import { ETIQUETA_AREA } from "@/lib/director";

/** Webhook de WhatsApp (API oficial de Meta). Pública en RUTAS_PUBLICAS:
 * quien llama es Meta, no un navegador con sesión. Seguridad: (1) el GET de
 * verificación exige WHATSAPP_VERIFY_TOKEN; (2) cada POST trae la firma
 * X-Hub-Signature-256 con WHATSAPP_APP_SECRET y se comprueba; (3) solo se
 * obedecen mensajes que vienen del celular de Isaac (WHATSAPP_ISAAC).
 * Meta exige contestar 200 rápido; si algo truena por dentro, se anota y se
 * contesta 200 igual (si no, Meta reintenta el mismo mensaje por horas). */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PANTALLA = "https://daymart-crm.vercel.app/director";

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN;
  if (p.get("hub.mode") === "subscribe" && esperado && p.get("hub.verify_token") === esperado) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "Verificación inválida" }, { status: 403 });
}

function firmaValida(cuerpo: string, firma: string | null) {
  const secreto = process.env.WHATSAPP_APP_SECRET;
  if (!secreto) return true; // sin secreto configurado no se puede comprobar: se deja pasar (se avisa en la pantalla de configuración)
  if (!firma?.startsWith("sha256=")) return false;
  const esperada = createHmac("sha256", secreto).update(cuerpo).digest("hex");
  const a = Buffer.from(firma.slice(7));
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface MensajeMeta {
  id: string;
  from: string;
  type: string;
  timestamp?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
}

function mensajesDe(cuerpo: unknown): MensajeMeta[] {
  const out: MensajeMeta[] = [];
  const entradas = (cuerpo as { entry?: { changes?: { value?: { messages?: MensajeMeta[] } }[] }[] })?.entry ?? [];
  for (const e of entradas) for (const c of e.changes ?? []) for (const m of c.value?.messages ?? []) out.push(m);
  return out;
}

function textoDe(m: MensajeMeta) {
  return m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
}

export async function POST(request: NextRequest) {
  const crudo = await request.text();
  if (!firmaValida(crudo, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(crudo);
  } catch {
    return NextResponse.json({ ok: true, ignorado: "no es JSON" });
  }
  const supabase = createServiceClient();
  const atendidos: string[] = [];

  for (const m of mensajesDe(cuerpo)) {
    const texto = textoDe(m).trim();
    if (!texto) continue;
    const deIsaac = esIsaac(m.from);
    // Se guarda primero (wa_id único): si Meta repite el aviso, el insert
    // falla y no se procesa dos veces.
    const { data: guardado, error: errorInsert } = await supabase
      .from("director_mensajes")
      .insert({ wa_id: m.id, direccion: "ENTRADA", de: m.from, texto, tipo: deIsaac ? "ORDEN" : "IGNORADO", interpretacion: deIsaac ? {} : { motivo: "no es el celular de Isaac" } })
      .select("id")
      .single<{ id: string }>();
    if (errorInsert || !guardado) continue;
    if (!deIsaac) continue;

    let respuesta = "";
    let tipo: "DECISION" | "ORDEN" | "CONSULTA" | "IGNORADO" = "ORDEN";
    let interpretacion: Record<string, unknown> = {};
    try {
      const pendientes = await propuestasPendientes();
      const inter = interpretarMensaje(texto, pendientes.map((p) => p.orden));
      tipo = inter.tipo;
      interpretacion = { ...inter };
      if (inter.tipo === "DECISION") {
        const r = await registrarDecisiones(inter.decisiones.map((d) => ({ orden: d.orden, decision: d.decision, precio: d.precio ?? null })), "WHATSAPP");
        respuesta = textoResultadoDecisiones(r);
        if (inter.desconocidos.length) respuesta += `\n(Los números ${inter.desconocidos.join(", ")} no están en la lista de hoy.)`;
        respuesta += `\nDetalle: ${PANTALLA}`;
        interpretacion.resultado = { aprobadas: r.aprobadas, rechazadas: r.rechazadas, ejecutadas: r.ejecucion.filter((e) => e.ok).length, fallidas: r.ejecucion.filter((e) => !e.ok).length };
      } else if (inter.tipo === "CONSULTA") {
        respuesta = textoPendientes(pendientes.map((p) => ({ orden: p.orden, titulo: `${p.titulo} (${ETIQUETA_AREA[p.area]})`, area: p.area, precio_propuesto: p.precio_propuesto })), PANTALLA);
      } else if (inter.tipo === "IGNORADO") {
        respuesta = "Va, hoy no. Mañana te vuelvo a preguntar.";
      } else {
        respuesta = "Anotado para el Director: lo atiende en su próxima corrida (o dile 'va' a la pregunta de la mañana para que arranque ya).";
      }
    } catch (e) {
      respuesta = `No pude procesar tu mensaje: ${e instanceof Error ? e.message : "error"}. Revísalo en ${PANTALLA}`;
      interpretacion.error = e instanceof Error ? e.message : String(e);
    }

    const envio = await enviarWhatsapp(respuesta).catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : "fallo al enviar" }));
    await supabase
      .from("director_mensajes")
      .update({ tipo, interpretacion, respuesta, error: envio.ok ? null : envio.error ?? null, atendido_en: tipo === "ORDEN" ? null : new Date().toISOString() })
      .eq("id", guardado.id);
    atendidos.push(m.id);
  }

  if (atendidos.length) revalidatePath("/director");
  return NextResponse.json({ ok: true, atendidos: atendidos.length });
}

// WhatsApp ↔ Director Meli por la API oficial de Meta (WhatsApp Cloud API).
//
// Isaac (26 oct): "Meta directo quiero". Dos mitades:
// 1) `interpretarMensaje` (puro, probado): entiende lo que Isaac escribe con
//    el mismo sistema que usa en el chat — "va", "va menos 4 y 9", "no 4 9",
//    "el 4 a 1990", "hoy no", "estado" — y lo demás lo deja como ORDEN para
//    el Director.
// 2) `enviarWhatsapp`: manda un texto al celular de Isaac por Graph API.
//    OJO (regla de Meta): un negocio solo puede escribir texto libre dentro
//    de las 24 h siguientes al último mensaje de Isaac; fuera de esa ventana
//    hay que usar una PLANTILLA aprobada por Meta (`WHATSAPP_PLANTILLA`, con
//    un solo parámetro {{1}} = el texto). Si no hay plantilla, el mensaje de
//    la mañana no sale hasta que Isaac escriba algo (ej. "hola").
//
// Variables de entorno (Vercel): WHATSAPP_TOKEN (token permanente del usuario
// del sistema), WHATSAPP_PHONE_ID (id del número de WhatsApp Business),
// WHATSAPP_VERIFY_TOKEN (palabra que se inventa Isaac para que Meta verifique
// el webhook), WHATSAPP_APP_SECRET (para comprobar la firma de cada aviso),
// WHATSAPP_ISAAC (celular de Isaac, solo dígitos, ej. 5215512345678),
// WHATSAPP_PLANTILLA (opcional, nombre de la plantilla aprobada).

export type TipoMensajeWhatsapp = "DECISION" | "ORDEN" | "CONSULTA" | "IGNORADO";

export interface DecisionWhatsapp {
  orden: number;
  decision: "APROBAR" | "RECHAZAR";
  precio?: number | null;
}

export interface Interpretacion {
  tipo: TipoMensajeWhatsapp;
  decisiones: DecisionWhatsapp[];
  /** Números que mencionó pero que no existen entre las pendientes. */
  desconocidos: number[];
  nota?: string;
}

function normalizar(texto: string) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "1,990" / "$1990" / "1.990" → 1990 (para precios en pesos). */
function leerPrecio(s: string): number | null {
  const limpio = s.replace(/[$\s]/g, "").replace(/[.,](?=\d{3}(\D|$))/g, "");
  const n = Number(limpio.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const SI = /^(va|sale|ok|okay|si|sii|dale|adelante|aprobado|apruebo|apruebalo|apruebalas|todo|va todo|va todas|si va|va si)\b/;
const NO_TODO = /^(no|nada|ninguna|ninguno|rechaza todo|rechazalas|no quiero nada|nada hoy)$/;
const HOY_NO = /^(hoy no|no hoy|hoy nada|ahorita no|luego|despues)$/;
const CONSULTA = /^(estado|status|pendientes|que hay|que tienes|\?|resumen|que toca)$/;

/** Entiende el mensaje de Isaac sobre la lista numerada del día.
 * `pendientes` = números de las propuestas que siguen esperando decisión. */
export function interpretarMensaje(textoCrudo: string, pendientes: number[]): Interpretacion {
  const texto = normalizar(textoCrudo);
  const existe = new Set(pendientes);
  if (!texto) return { tipo: "IGNORADO", decisiones: [], desconocidos: [] };
  if (HOY_NO.test(texto)) return { tipo: "IGNORADO", decisiones: [], desconocidos: [], nota: "hoy no" };
  if (CONSULTA.test(texto)) return { tipo: "CONSULTA", decisiones: [], desconocidos: [] };

  // Precios por renglón: "4 a 1990", "el 4 a $1,990", "#4 → 1990", "4 en 1990".
  const precios = new Map<number, number>();
  const rePrecio = /(?:^|\s)(?:el\s+|la\s+|#)?(\d{1,3})\s*(?:a|en|->|→|=|:)\s*\$?\s*([\d][\d.,]*)/g;
  let m: RegExpExecArray | null;
  let restante = texto;
  while ((m = rePrecio.exec(texto)) !== null) {
    const orden = Number(m[1]);
    const precio = leerPrecio(m[2]);
    if (precio !== null && precio >= 10) {
      precios.set(orden, precio);
      restante = restante.replace(m[0], " ");
    }
  }
  restante = normalizar(restante);

  // Exclusiones: "menos 4 y 9", "sin el 4", "excepto 4", "no 4 9", "no el 4".
  const excluidos = new Set<number>();
  const reExcl = /(?:menos|sin|excepto|salvo|quita|no)\s+((?:(?:el|la|los|las|y|e|#)\s*|\d{1,3}\s*)+)/g;
  let huboExclusion = false;
  while ((m = reExcl.exec(restante)) !== null) {
    const nums = m[1].match(/\d{1,3}/g) ?? [];
    if (nums.length) {
      huboExclusion = true;
      for (const n of nums) excluidos.add(Number(n));
    }
  }

  const esSi = SI.test(restante);
  const soloNumeros = /^[\d\s#]+$/.test(restante) && /\d/.test(restante);
  const rechazaTodo = NO_TODO.test(restante);

  if (rechazaTodo && !precios.size) {
    return { tipo: "DECISION", decisiones: pendientes.map((orden) => ({ orden, decision: "RECHAZAR" as const })), desconocidos: [] };
  }

  // Convención de Isaac: contesta con los números que NO quiere → se
  // rechazan esos y se aprueba lo demás.
  if (soloNumeros) {
    huboExclusion = true;
    for (const n of restante.match(/\d{1,3}/g) ?? []) excluidos.add(Number(n));
  }

  if (esSi || huboExclusion || precios.size) {
    const desconocidos = [...excluidos, ...precios.keys()].filter((n) => !existe.has(n));
    const decisiones: DecisionWhatsapp[] = pendientes.map((orden) =>
      excluidos.has(orden) ? { orden, decision: "RECHAZAR" } : { orden, decision: "APROBAR", precio: precios.get(orden) ?? null },
    );
    return { tipo: "DECISION", decisiones, desconocidos: Array.from(new Set(desconocidos)) };
  }

  return { tipo: "ORDEN", decisiones: [], desconocidos: [] };
}

/** Texto del resumen de pendientes para WhatsApp (corto, para el celular). */
export function textoPendientes(pendientes: { orden: number; titulo: string; area: string; precio_propuesto: number | null }[], link: string) {
  if (!pendientes.length) return "No tienes propuestas pendientes del Director.";
  const lineas = pendientes.slice(0, 25).map((p) => `${p.orden}. ${p.titulo}${p.precio_propuesto ? ` — $${Number(p.precio_propuesto).toLocaleString("es-MX")}` : ""}`);
  const mas = pendientes.length > 25 ? `\n… y ${pendientes.length - 25} más en ${link}` : "";
  return `Pendientes (${pendientes.length}):\n${lineas.join("\n")}${mas}\n\nContesta "va", "va menos 4 y 9" o "4 a 1990".`;
}

// ---- Envío por Meta -------------------------------------------------------

export function whatsappConfigurado() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_ISAAC);
}

export function soloDigitos(s: string) {
  return s.replace(/\D/g, "");
}

/** ¿Es el celular de Isaac? Se comparan los últimos 10 dígitos (Meta a
 * veces manda 52 + 1 + 10 dígitos para México, a veces 52 + 10). */
export function esIsaac(de: string) {
  const isaac = soloDigitos(process.env.WHATSAPP_ISAAC ?? "");
  if (!isaac) return false;
  return soloDigitos(de).slice(-10) === isaac.slice(-10);
}

interface RespuestaGraph {
  messages?: { id: string }[];
  error?: { message?: string; code?: number; error_subcode?: number; error_data?: { details?: string } };
}

async function postGraph(cuerpo: Record<string, unknown>): Promise<RespuestaGraph> {
  const r = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  return (await r.json().catch(() => ({}))) as RespuestaGraph;
}

/** Manda un texto a Isaac. Si Meta dice que estamos fuera de la ventana de
 * 24 h y hay plantilla, lo manda como plantilla (un parámetro = el texto,
 * sin saltos de línea porque Meta no los acepta en parámetros). */
export async function enviarWhatsapp(texto: string): Promise<{ ok: boolean; id?: string; error?: string; viaPlantilla?: boolean }> {
  if (!whatsappConfigurado()) return { ok: false, error: "WhatsApp no está configurado (faltan WHATSAPP_TOKEN, WHATSAPP_PHONE_ID o WHATSAPP_ISAAC)." };
  const to = soloDigitos(process.env.WHATSAPP_ISAAC!);
  const cuerpo = texto.slice(0, 4000);
  const r = await postGraph({ messaging_product: "whatsapp", to, type: "text", text: { body: cuerpo, preview_url: false } });
  if (r.messages?.[0]?.id) return { ok: true, id: r.messages[0].id };
  const codigo = r.error?.code;
  const plantilla = process.env.WHATSAPP_PLANTILLA;
  // 131047 = fuera de la ventana de 24 h; 131026/130429 = no entregable/limite.
  if (plantilla && (codigo === 131047 || codigo === 131026)) {
    const plano = cuerpo.replace(/\s*\n+\s*/g, " | ").replace(/\s{4,}/g, "   ").slice(0, 1000);
    const r2 = await postGraph({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: { name: plantilla, language: { code: "es_MX" }, components: [{ type: "body", parameters: [{ type: "text", text: plano }] }] },
    });
    if (r2.messages?.[0]?.id) return { ok: true, id: r2.messages[0].id, viaPlantilla: true };
    return { ok: false, error: `Plantilla: ${r2.error?.message ?? "Meta no aceptó la plantilla"}${r2.error?.error_data?.details ? ` (${r2.error.error_data.details})` : ""}` };
  }
  return { ok: false, error: `${r.error?.message ?? "Meta no aceptó el mensaje"}${codigo ? ` (código ${codigo})` : ""}${r.error?.error_data?.details ? ` — ${r.error.error_data.details}` : ""}` };
}

// Atención a clientes de Mercado Libre — Fase 1: preguntas (21 oct).
//
// 1) `sincronizarPreguntas` copia las preguntas sin responder (y detecta las
//    que Isaac contestó directo en ML). El webhook (tópico "questions") hace
//    lo mismo con una sola pregunta (`sincronizarPregunta`).
// 2) `generarBorradoresPendientes` le pide a la IA un borrador para cada
//    pregunta nueva, con el contexto del producto (publicación, ficha del
//    CRM, stock) y las respuestas/correcciones anteriores de Isaac.
// 3) Isaac aprueba (o corrige) → `responderPregunta` lo manda a ML
//    (POST /answers). Nada se manda sin su clic.
//
// Tablas en la migración 0056 (RLS sin políticas: solo service role).

import { mercadolibreGet, obtenerConexion } from "./mercadolibre-auth";
import { mercadolibrePost } from "./mercadolibre-post";
import { createServiceClient } from "./supabase/servicio";
import { todasLasFilas } from "./cargar-todo";
import { stockActual } from "./calculos-stock";
import { claveVinculo, obtenerVinculos, skuCrmDe, type PublicacionMl } from "./mercadolibre-stock";
import { formatoFechaHoraMx } from "./fechas-mx";
import { iaConfigurada, redactarConIa, type ContextoPregunta } from "./ia-respuestas";
import { problemaEnRespuesta } from "./respuestas-ml";
import type { MovimientoStock } from "./tipos";

export type EstadoPregunta = "PENDIENTE" | "RESPONDIDA" | "DESCARTADA" | "CERRADA";

export interface PreguntaMl {
  id: number;
  item_id: string;
  texto: string;
  fecha_creacion: string;
  comprador_id: number | null;
  estado_ml: string | null;
  estado: EstadoPregunta;
  borrador: string | null;
  borrador_original: string | null;
  confianza: string | null;
  categoria: string | null;
  nota_ia: string | null;
  borrador_generado_en: string | null;
  borrador_error: string | null;
  respuesta_enviada: string | null;
  respondida_en: string | null;
  respondida_por: string | null;
  editada: boolean;
  avisado_en: string | null;
}

export interface ConfigAtencion {
  reglas: string | null;
  telegram_chat_id: string | null;
}

interface PreguntaApi {
  id: number;
  item_id: string;
  text: string;
  status: string;
  date_created: string;
  from?: { id?: number } | null;
  answer?: { text?: string; status?: string; date_created?: string } | null;
}

/** "Falta el SQL 0056" se detecta por el mensaje de PostgREST. */
export function faltaSqlAtencion(mensaje: string | undefined | null) {
  return Boolean(mensaje && /mercadolibre_(preguntas|atencion_config)/.test(mensaje) && /(does not exist|schema cache|Could not find)/i.test(mensaje));
}

/** Estado del CRM según lo que dice ML (sin pisar lo que Isaac ya decidió). */
function estadoLocal(api: PreguntaApi, actual: EstadoPregunta | null): EstadoPregunta {
  if (api.status === "ANSWERED") return "RESPONDIDA";
  if (api.status === "UNANSWERED" || api.status === "UNDER_REVIEW") return actual ?? "PENDIENTE";
  return "CERRADA";
}

/** Guarda (o actualiza) un grupo de preguntas tal como vienen de ML. */
async function guardarPreguntas(preguntas: PreguntaApi[]) {
  if (!preguntas.length) return { nuevas: 0 };
  const supabase = createServiceClient();
  const { data: existentes, error } = await supabase
    .from("mercadolibre_preguntas")
    .select("id, estado, respondida_por")
    .in("id", preguntas.map((p) => p.id))
    .returns<{ id: number; estado: EstadoPregunta; respondida_por: string | null }[]>();
  if (error) throw new Error(error.message);
  const porId = new Map((existentes ?? []).map((e) => [Number(e.id), e]));
  const ahora = new Date().toISOString();
  let nuevas = 0;
  for (const p of preguntas) {
    const actual = porId.get(Number(p.id)) ?? null;
    const estado = estadoLocal(p, actual?.estado ?? null);
    const contestadaEnMl = estado === "RESPONDIDA" && actual?.estado !== "RESPONDIDA";
    const fila: Record<string, unknown> = { estado_ml: p.status, estado, crudo: p, actualizado_en: ahora };
    if (contestadaEnMl) {
      fila.respuesta_enviada = p.answer?.text ?? null;
      fila.respondida_en = p.answer?.date_created ?? ahora;
      fila.respondida_por = "ml";
    }
    if (actual) {
      const { error: e } = await supabase.from("mercadolibre_preguntas").update(fila).eq("id", p.id);
      if (e) throw new Error(e.message);
    } else {
      const { error: e } = await supabase.from("mercadolibre_preguntas").insert({
        ...fila,
        id: p.id,
        item_id: p.item_id,
        texto: p.text,
        fecha_creacion: p.date_created,
        comprador_id: p.from?.id ?? null,
      });
      if (e) throw new Error(e.message);
      if (estado === "PENDIENTE") nuevas++;
    }
  }
  return { nuevas };
}

async function buscarPreguntas(mlUserId: number, status: string, maximo: number) {
  const todas: PreguntaApi[] = [];
  for (let offset = 0; offset < maximo; offset += 50) {
    const r = await mercadolibreGet<{ total?: number; questions?: PreguntaApi[] }>(
      `/my/received_questions/search?seller_id=${mlUserId}&status=${status}&api_version=4&sort_fields=date_created&sort_types=DESC&limit=50&offset=${offset}`,
    );
    const lista = r.questions ?? [];
    todas.push(...lista);
    if (lista.length < 50 || todas.length >= (r.total ?? 0)) break;
  }
  return todas;
}

/** Trae todas las preguntas sin responder de ML y revisa las que el CRM
 * tenía pendientes y ya no lo están (contestadas directo en ML, borradas…).
 * La primera vez también copia las últimas 50 respondidas, para que la IA
 * aprenda el tono de Isaac desde el día uno. */
export async function sincronizarPreguntas() {
  const conexion = await obtenerConexion();
  if (!conexion) throw new Error("Mercado Libre no está conectado.");
  const supabase = createServiceClient();

  const sinResponder = await buscarPreguntas(conexion.ml_user_id, "UNANSWERED", 300);
  const { nuevas } = await guardarPreguntas(sinResponder);

  // Las que el CRM tiene pendientes pero ML ya no lista como sin responder.
  const vivas = new Set(sinResponder.map((p) => Number(p.id)));
  const { data: locales } = await supabase.from("mercadolibre_preguntas").select("id").eq("estado", "PENDIENTE").returns<{ id: number }[]>();
  const revisar = (locales ?? []).map((l) => Number(l.id)).filter((id) => !vivas.has(id)).slice(0, 20);
  for (const id of revisar) await sincronizarPregunta(id).catch(() => null);

  // Ejemplos del estilo de Isaac (solo mientras haya pocos).
  const { count } = await supabase.from("mercadolibre_preguntas").select("id", { count: "exact", head: true }).eq("estado", "RESPONDIDA");
  if ((count ?? 0) < 20) {
    const respondidas = await buscarPreguntas(conexion.ml_user_id, "ANSWERED", 50).catch(() => []);
    await guardarPreguntas(respondidas.slice(0, 50));
  }
  return { sinResponder: sinResponder.length, nuevas };
}

/** Una sola pregunta (aviso del webhook, o revisión de una que desapareció). */
export async function sincronizarPregunta(id: number) {
  const p = await mercadolibreGet<PreguntaApi>(`/questions/${id}?api_version=4`);
  if (!p?.id) return;
  await guardarPreguntas([p]);
}

// ---------------------------------------------------------------------------
// Contexto para la IA

interface ItemApi {
  id: string;
  title?: string;
  price?: number;
  attributes?: { name?: string; value_name?: string | null }[];
  sale_terms?: { id?: string; name?: string; value_name?: string | null }[];
  warranty?: string | null;
  shipping?: { free_shipping?: boolean } | null;
}

export async function obtenerConfigAtencion(): Promise<ConfigAtencion> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("mercadolibre_atencion_config").select("reglas, telegram_chat_id").eq("id", 1).maybeSingle<ConfigAtencion>();
  return { reglas: data?.reglas ?? null, telegram_chat_id: data?.telegram_chat_id ?? null };
}

async function armarContexto(p: PreguntaMl, indicacion: string | null, comun: { vinculos: Map<string, string>; reglas: string | null }): Promise<ContextoPregunta> {
  const supabase = createServiceClient();
  const [{ data: pubs }, item, descripcion, { data: delProducto }, { data: corregidas }, { data: recientes }] = await Promise.all([
    supabase.from("mercadolibre_publicaciones").select("*").eq("item_id", p.item_id).returns<PublicacionMl[]>(),
    mercadolibreGet<ItemApi>(`/items/${p.item_id}?attributes=id,title,price,attributes,sale_terms,warranty,shipping`).catch(() => null),
    mercadolibreGet<{ plain_text?: string }>(`/items/${p.item_id}/description`).catch(() => null),
    supabase
      .from("mercadolibre_preguntas")
      .select("texto, respuesta_enviada")
      .eq("item_id", p.item_id)
      .eq("estado", "RESPONDIDA")
      .not("respuesta_enviada", "is", null)
      .order("fecha_creacion", { ascending: false })
      .limit(10)
      .returns<{ texto: string; respuesta_enviada: string }[]>(),
    supabase
      .from("mercadolibre_preguntas")
      .select("texto, borrador_original, respuesta_enviada")
      .eq("editada", true)
      .order("respondida_en", { ascending: false })
      .limit(8)
      .returns<{ texto: string; borrador_original: string | null; respuesta_enviada: string | null }[]>(),
    supabase
      .from("mercadolibre_preguntas")
      .select("texto, respuesta_enviada, item_id")
      .eq("estado", "RESPONDIDA")
      .neq("item_id", p.item_id)
      .not("respuesta_enviada", "is", null)
      .order("respondida_en", { ascending: false })
      .limit(6)
      .returns<{ texto: string; respuesta_enviada: string }[]>(),
  ]);

  const publicaciones = pubs ?? [];
  // Ficha del CRM: el primer producto ligado de esta publicación.
  let ficha: ContextoPregunta["ficha"] = null;
  const skus = Array.from(new Set(publicaciones.map((x) => skuCrmDe(x, comun.vinculos, new Set()).sku).filter((s): s is string => Boolean(s))));
  if (skus.length) {
    const sku = skus[0];
    const [{ data: cat }, { data: movs }] = await Promise.all([
      supabase.from("productos_catalogo").select("nombre, descripcion, peso_kg, memo").eq("sku", sku).maybeSingle<{ nombre: string; descripcion: string | null; peso_kg: number | null; memo: string | null }>(),
      todasLasFilas<MovimientoStock>((desde, hasta) => supabase.from("movimientos_stock").select("*", { count: "exact" }).eq("sku", sku).order("creado_en").order("id").range(desde, hasta)),
    ]);
    ficha = {
      nombre: cat?.nombre ?? movs?.[movs.length - 1]?.nombre ?? sku,
      descripcion: cat?.descripcion ?? null,
      pesoKg: cat?.peso_kg ?? null,
      memo: cat?.memo ?? null,
      enBodega: movs ? Math.max(0, stockActual(movs)) : null,
    };
  }

  const garantia = item?.warranty || item?.sale_terms?.filter((t) => /garant|warranty/i.test(`${t.id} ${t.name}`)).map((t) => `${t.name}: ${t.value_name}`).join(" · ") || null;
  return {
    pregunta: p.texto,
    fecha: formatoFechaHoraMx(p.fecha_creacion),
    publicacion: {
      itemId: p.item_id,
      titulo: item?.title ?? publicaciones[0]?.titulo ?? p.item_id,
      precio: item?.price ?? publicaciones[0]?.precio ?? null,
      variantes: publicaciones.map((x) => ({
        variacion: x.variacion,
        disponible: x.logistica === "fulfillment" ? (x.full_disponible ?? 0) : x.cantidad_publicada,
        enFull: x.logistica === "fulfillment",
      })),
      descripcion: descripcion?.plain_text?.trim() || null,
      atributos: (item?.attributes ?? []).filter((a) => a.name && a.value_name).map((a) => `${a.name}: ${a.value_name}`).slice(0, 60),
      garantia,
      envioGratis: item?.shipping?.free_shipping ?? null,
    },
    ficha,
    anterioresDelProducto: (delProducto ?? []).map((e) => ({ pregunta: e.texto, respuesta: e.respuesta_enviada })),
    correcciones: (corregidas ?? []).filter((e) => e.borrador_original && e.respuesta_enviada).map((e) => ({ pregunta: e.texto, borrador: e.borrador_original!, final: e.respuesta_enviada! })),
    ejemplos: (recientes ?? []).map((e) => ({ pregunta: e.texto, respuesta: e.respuesta_enviada })),
    reglas: comun.reglas,
    indicacion,
  };
}

async function datosComunes() {
  const [vinculosLista, config] = await Promise.all([obtenerVinculos(), obtenerConfigAtencion()]);
  return { vinculos: new Map(vinculosLista.map((v) => [claveVinculo(v.item_id, v.variation_id), v.sku_crm])), reglas: config.reglas };
}

/** Redacta (o vuelve a redactar) el borrador de una pregunta y lo guarda. */
export async function redactarBorrador(id: number, indicacion: string | null = null, comun?: Awaited<ReturnType<typeof datosComunes>>) {
  const supabase = createServiceClient();
  const { data: p, error } = await supabase.from("mercadolibre_preguntas").select("*").eq("id", id).maybeSingle<PreguntaMl>();
  if (error) throw new Error(error.message);
  if (!p) throw new Error("No encontré esa pregunta.");
  try {
    const contexto = await armarContexto(p, indicacion?.trim() || null, comun ?? (await datosComunes()));
    const b = await redactarConIa(contexto);
    await supabase
      .from("mercadolibre_preguntas")
      .update({
        borrador: b.respuesta,
        borrador_original: b.respuesta,
        confianza: b.confianza,
        categoria: b.categoria,
        nota_ia: b.nota || null,
        borrador_generado_en: new Date().toISOString(),
        borrador_error: null,
      })
      .eq("id", id);
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudo redactar.";
    await supabase.from("mercadolibre_preguntas").update({ borrador_error: mensaje, borrador_generado_en: new Date().toISOString() }).eq("id", id);
    throw new Error(mensaje);
  }
}

/** Redacta los borradores que falten (de la más vieja a la más nueva),
 * de 3 en 3, mientras quede tiempo. Una pregunta que falló se reintenta
 * después de 15 minutos. */
export async function generarBorradoresPendientes(presupuestoMs = 30000) {
  if (!iaConfigurada()) return { redactadas: 0, errores: 0, sinLlave: true };
  const inicio = Date.now();
  const supabase = createServiceClient();
  const reintento = new Date(Date.now() - 15 * 60000).toISOString();
  const { data } = await supabase
    .from("mercadolibre_preguntas")
    .select("id")
    .eq("estado", "PENDIENTE")
    .is("borrador", null)
    .or(`borrador_error.is.null,borrador_generado_en.lt.${reintento}`)
    .order("fecha_creacion", { ascending: true })
    .limit(30)
    .returns<{ id: number }[]>();
  const ids = (data ?? []).map((d) => Number(d.id));
  if (!ids.length) return { redactadas: 0, errores: 0, sinLlave: false };
  const comun = await datosComunes();
  let redactadas = 0;
  let errores = 0;
  for (let i = 0; i < ids.length; i += 3) {
    // Cada borrador tarda ~10–20 s: no se empieza una tanda que no alcance.
    if (Date.now() - inicio > presupuestoMs - 20000) break;
    const r = await Promise.allSettled(ids.slice(i, i + 3).map((id) => redactarBorrador(id, null, comun)));
    redactadas += r.filter((x) => x.status === "fulfilled").length;
    errores += r.filter((x) => x.status === "rejected").length;
  }
  return { redactadas, errores, sinLlave: false };
}

// ---------------------------------------------------------------------------
// Acciones de Isaac

/** Manda la respuesta a Mercado Libre y la guarda. `texto` es lo que Isaac
 * aprobó (el borrador tal cual o corregido). */
export async function responderPregunta(id: number, texto: string) {
  const limpio = texto.trim();
  const problema = problemaEnRespuesta(limpio);
  if (problema) throw new Error(problema);
  const supabase = createServiceClient();
  const { data: p } = await supabase.from("mercadolibre_preguntas").select("estado, borrador_original").eq("id", id).maybeSingle<{ estado: EstadoPregunta; borrador_original: string | null }>();
  if (!p) throw new Error("No encontré esa pregunta.");
  if (p.estado === "RESPONDIDA") throw new Error("Esta pregunta ya estaba respondida.");
  try {
    await mercadolibrePost("/answers", { question_id: id, text: limpio });
  } catch (e) {
    // Si ML dice que ya no se puede contestar (borrada, ya respondida en
    // ML…), se refresca su estado para que salga de la lista.
    await sincronizarPregunta(id).catch(() => null);
    throw e;
  }
  const editada = Boolean(p.borrador_original) && normalizar(p.borrador_original!) !== normalizar(limpio);
  const { error } = await supabase
    .from("mercadolibre_preguntas")
    .update({ estado: "RESPONDIDA", estado_ml: "ANSWERED", respuesta_enviada: limpio, borrador: limpio, respondida_en: new Date().toISOString(), respondida_por: "crm", editada })
    .eq("id", id);
  if (error) throw new Error(`La respuesta SÍ se mandó a Mercado Libre, pero no se pudo guardar aquí: ${error.message}`);
}

function normalizar(t: string) {
  return t.replace(/\s+/g, " ").trim();
}

/** Quitar de la bandeja sin contestar (spam, repetida…). En ML sigue sin
 * respuesta. `volver` la regresa a la bandeja. */
export async function descartarPregunta(id: number, volver = false) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("mercadolibre_preguntas").update({ estado: volver ? "PENDIENTE" : "DESCARTADA" }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function guardarReglasAtencion(reglas: string) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("mercadolibre_atencion_config").upsert({ id: 1, reglas: reglas.trim() || null, actualizado_en: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Avisos al celular por Telegram (opcional)
//
// Isaac crea un bot con @BotFather y pone su llave en Vercel
// (TELEGRAM_BOT_TOKEN). Le escribe cualquier cosa al bot y en la pantalla le
// da "Conectar": `conectarTelegram` lee el último mensaje que recibió el bot
// y guarda ese chat. Desde ahí, cada pregunta nueva con borrador le llega al
// celular con el link para aprobarla.

export function telegramConfigurado() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

const URL_ATENCION = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || "daymart-crm.vercel.app"}/mercadolibre/atencion`;

async function telegram<T>(metodo: string, cuerpo: Record<string, unknown> = {}): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Falta la llave TELEGRAM_BOT_TOKEN en Vercel.");
  const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!j.ok) throw new Error(`Telegram respondió: ${j.description ?? r.status}`);
  return j.result as T;
}

export async function conectarTelegram() {
  const updates = await telegram<{ message?: { chat?: { id?: number; first_name?: string } } }[]>("getUpdates", { limit: 20 });
  const chat = [...updates].reverse().find((u) => u.message?.chat?.id)?.message?.chat;
  if (!chat?.id) throw new Error("Tu bot todavía no recibe ningún mensaje: ábrelo en Telegram, mándale \"hola\" y vuelve a intentar.");
  const supabase = createServiceClient();
  const { error } = await supabase.from("mercadolibre_atencion_config").upsert({ id: 1, telegram_chat_id: String(chat.id), actualizado_en: new Date().toISOString() });
  if (error) throw new Error(error.message);
  await telegram("sendMessage", { chat_id: chat.id, text: "✅ Listo: aquí te van a llegar las preguntas de Mercado Libre de Daymart." });
  return chat.first_name ?? String(chat.id);
}

export async function desconectarTelegram() {
  const supabase = createServiceClient();
  await supabase.from("mercadolibre_atencion_config").upsert({ id: 1, telegram_chat_id: null, actualizado_en: new Date().toISOString() });
}

/** Avisa al celular las preguntas pendientes que todavía no se avisaron
 * (con su borrador si ya lo hay; si la IA no está, igual avisa). */
export async function avisarPreguntasNuevas() {
  if (!telegramConfigurado()) return 0;
  const config = await obtenerConfigAtencion();
  if (!config.telegram_chat_id) return 0;
  const supabase = createServiceClient();
  const hace10 = new Date(Date.now() - 10 * 60000).toISOString();
  const { data } = await supabase
    .from("mercadolibre_preguntas")
    .select("id, item_id, texto, borrador, confianza, fecha_creacion, borrador_generado_en")
    .eq("estado", "PENDIENTE")
    .is("avisado_en", null)
    .order("fecha_creacion", { ascending: true })
    .limit(10)
    .returns<Pick<PreguntaMl, "id" | "item_id" | "texto" | "borrador" | "confianza" | "fecha_creacion" | "borrador_generado_en">[]>();
  // Espera el borrador hasta 10 minutos; después avisa aunque no haya.
  const listas = (data ?? []).filter((p) => p.borrador || p.borrador_generado_en || !iaConfigurada() || p.fecha_creacion < hace10);
  if (!listas.length) return 0;
  const { data: pubs } = await supabase.from("mercadolibre_publicaciones").select("item_id, titulo").in("item_id", listas.map((p) => p.item_id)).returns<{ item_id: string; titulo: string | null }[]>();
  const titulo = new Map((pubs ?? []).map((x) => [x.item_id, x.titulo]));
  let avisadas = 0;
  for (const p of listas) {
    const lineas = [`❓ Pregunta en Mercado Libre`, `📦 ${titulo.get(p.item_id) ?? p.item_id}`, ``, `“${p.texto}”`];
    if (p.borrador) lineas.push(``, `✍️ Borrador (${p.confianza ?? "?"}):`, p.borrador);
    lineas.push(``, `Aprobar o corregir: ${URL_ATENCION}`);
    try {
      await telegram("sendMessage", { chat_id: config.telegram_chat_id, text: lineas.join("\n"), disable_web_page_preview: true });
      await supabase.from("mercadolibre_preguntas").update({ avisado_en: new Date().toISOString() }).eq("id", p.id);
      avisadas++;
    } catch {
      break;
    }
  }
  return avisadas;
}

/** Todo el ciclo: traer preguntas → redactar → avisar. Lo usan el reloj y
 * la pantalla. */
export async function atenderPreguntas(presupuestoMs = 30000) {
  const inicio = Date.now();
  const sync = await sincronizarPreguntas();
  const borradores = await generarBorradoresPendientes(presupuestoMs - (Date.now() - inicio));
  const avisos = await avisarPreguntasNuevas().catch(() => 0);
  return { ...sync, ...borradores, avisos };
}

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
// Tablas en la migración 0057 (RLS sin políticas: solo service role).

import { mercadolibreGet, obtenerConexion } from "./mercadolibre-auth";
import { mercadolibrePost } from "./mercadolibre-post";
import { createServiceClient } from "./supabase/servicio";
import { todasLasFilas } from "./cargar-todo";
import { stockActual } from "./calculos-stock";
import { claveVinculo, obtenerVinculos, skuCrmDe, type PublicacionMl } from "./mercadolibre-stock";
import { formatoFechaHoraMx, inicioDelDiaMx } from "./fechas-mx";
import { COSTO_MAXIMO_RESPUESTA, ErrorIa, iaConfigurada, redactarConIa, type ContextoPregunta } from "./ia-respuestas";
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
  whatsapp_telefono: string | null;
  whatsapp_apikey: string | null;
  /** Lo más que se puede gastar en la IA por día (dólares). Máximo $2. */
  limite_diario_usd: number;
}

export const LIMITE_DIARIO_DEFAULT = 1;
export const LIMITE_DIARIO_MAXIMO = 2;

interface PreguntaApi {
  id: number;
  item_id: string;
  text: string;
  status: string;
  date_created: string;
  from?: { id?: number } | null;
  answer?: { text?: string; status?: string; date_created?: string } | null;
}

/** "Falta el SQL 0057" se detecta por el mensaje de PostgREST. */
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
  const { data } = await supabase.from("mercadolibre_atencion_config").select("reglas, whatsapp_telefono, whatsapp_apikey, limite_diario_usd").eq("id", 1).maybeSingle<ConfigAtencion>();
  return {
    reglas: data?.reglas ?? null,
    whatsapp_telefono: data?.whatsapp_telefono ?? null,
    whatsapp_apikey: data?.whatsapp_apikey ?? null,
    limite_diario_usd: Math.min(LIMITE_DIARIO_MAXIMO, Number(data?.limite_diario_usd ?? LIMITE_DIARIO_DEFAULT) || LIMITE_DIARIO_DEFAULT),
  };
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
  return { vinculos: new Map(vinculosLista.map((v) => [claveVinculo(v.item_id, v.variation_id), v.sku_crm])), reglas: config.reglas, limite: config.limite_diario_usd };
}

// ---------------------------------------------------------------------------
// Tope diario de gasto en la IA (Isaac, 22 oct: "limitado a $1 o $2 diarios,
// no más, para que no se me acaben mis $100"). Cada llamada anota lo que
// costó en `mercadolibre_ia_gastos`; antes de cada llamada se aparta el costo
// máximo posible de una respuesta, así el total del día nunca pasa del tope.
// El día se cuenta en horario de la Ciudad de México.

/** Gasto del día en la IA por origen: ATENCION (preguntas) o DIRECTOR (el
 * chat del Director, migración 0060). Cada uno tiene su propio tope. Si la
 * columna `origen` todavía no existe (sin el SQL 0060), se suma todo. */
export async function gastoIaHoy(origen: "ATENCION" | "DIRECTOR" = "ATENCION") {
  const supabase = createServiceClient();
  const desde = inicioDelDiaMx(new Date()).toISOString();
  let { data, error } = await supabase.from("mercadolibre_ia_gastos").select("costo_usd").eq("origen", origen).gte("creado_en", desde).returns<{ costo_usd: number }[]>();
  if (error && /origen/.test(error.message)) {
    ({ data, error } = await supabase.from("mercadolibre_ia_gastos").select("costo_usd").gte("creado_en", desde).returns<{ costo_usd: number }[]>());
  }
  if (error) throw new Error(`No pude revisar cuánto se ha gastado hoy en la IA (¿falta el SQL 0057?): ${error.message}`);
  return (data ?? []).reduce((s, g) => s + Number(g.costo_usd || 0), 0);
}

/** Anota lo que costó una llamada a la IA (para el tope diario). */
export async function anotarGastoIa(origen: "ATENCION" | "DIRECTOR", costoUsd: number, preguntaId: number | null = null) {
  if (!costoUsd) return;
  const supabase = createServiceClient();
  const { error } = await supabase.from("mercadolibre_ia_gastos").insert({ pregunta_id: preguntaId, costo_usd: costoUsd, origen });
  if (error && /origen/.test(error.message)) await supabase.from("mercadolibre_ia_gastos").insert({ pregunta_id: preguntaId, costo_usd: costoUsd });
}

async function registrarGastoIa(preguntaId: number, costoUsd: number) {
  await anotarGastoIa("ATENCION", costoUsd, preguntaId);
}

export class TopeDiario extends Error {}

function mensajeTope(limite: number) {
  return `Ya se usó el tope de $${limite.toFixed(2)} USD de hoy en la IA: esta pregunta la contestas tú, o mañana se redacta sola.`;
}

/** Redacta (o vuelve a redactar) el borrador de una pregunta y lo guarda. */
export async function redactarBorrador(id: number, indicacion: string | null = null, comun?: Awaited<ReturnType<typeof datosComunes>>) {
  const supabase = createServiceClient();
  const { data: p, error } = await supabase.from("mercadolibre_preguntas").select("*").eq("id", id).maybeSingle<PreguntaMl>();
  if (error) throw new Error(error.message);
  if (!p) throw new Error("No encontré esa pregunta.");
  const datos = comun ?? (await datosComunes());
  if ((await gastoIaHoy()) + COSTO_MAXIMO_RESPUESTA > datos.limite) throw new TopeDiario(mensajeTope(datos.limite));
  try {
    const contexto = await armarContexto(p, indicacion?.trim() || null, datos);
    const b = await redactarConIa(contexto);
    await registrarGastoIa(id, b.costoUsd);
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
    if (e instanceof ErrorIa) await registrarGastoIa(id, e.costoUsd);
    const mensaje = e instanceof Error ? e.message : "No se pudo redactar.";
    await supabase.from("mercadolibre_preguntas").update({ borrador_error: mensaje, borrador_generado_en: new Date().toISOString() }).eq("id", id);
    throw new Error(mensaje);
  }
}

/** Redacta los borradores que falten (de la más vieja a la más nueva),
 * de 3 en 3, mientras quede tiempo. Una pregunta que falló se reintenta
 * después de 15 minutos. */
export async function generarBorradoresPendientes(presupuestoMs = 30000) {
  if (!iaConfigurada()) return { redactadas: 0, errores: 0, sinLlave: true, topeAlcanzado: false };
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
  if (!ids.length) return { redactadas: 0, errores: 0, sinLlave: false, topeAlcanzado: false };
  const comun = await datosComunes();
  let redactadas = 0;
  let errores = 0;
  let topeAlcanzado = false;
  for (let i = 0; i < ids.length; ) {
    // Cada borrador tarda ~10–20 s: no se empieza una tanda que no alcance.
    if (Date.now() - inicio > presupuestoMs - 20000) break;
    // De 3 en 3 mientras sobre dinero para las 3; cerca del tope, de una en una.
    const disponible = comun.limite - (await gastoIaHoy());
    const cuantas = Math.min(3, Math.floor(disponible / COSTO_MAXIMO_RESPUESTA));
    if (cuantas < 1) {
      topeAlcanzado = true;
      break;
    }
    const r = await Promise.allSettled(ids.slice(i, i + cuantas).map((id) => redactarBorrador(id, null, comun)));
    i += cuantas;
    redactadas += r.filter((x) => x.status === "fulfilled").length;
    errores += r.filter((x) => x.status === "rejected" && !(x.reason instanceof TopeDiario)).length;
  }
  return { redactadas, errores, sinLlave: false, topeAlcanzado };
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

export async function guardarLimiteDiario(limite: number) {
  if (!(limite > 0)) throw new Error("Pon un tope mayor a $0.");
  if (limite > LIMITE_DIARIO_MAXIMO) throw new Error(`El tope máximo es de $${LIMITE_DIARIO_MAXIMO} USD al día.`);
  const supabase = createServiceClient();
  const { error } = await supabase.from("mercadolibre_atencion_config").upsert({ id: 1, limite_diario_usd: limite, actualizado_en: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function guardarReglasAtencion(reglas: string) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("mercadolibre_atencion_config").upsert({ id: 1, reglas: reglas.trim() || null, actualizado_en: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Avisos al celular por WhatsApp (opcional) — vía CallMeBot
//
// Isaac (22 oct) prefirió WhatsApp a Telegram. La API oficial de WhatsApp
// (Meta) pide cuenta de empresa verificada, número propio y plantillas
// aprobadas; para avisarse a sí mismo basta CallMeBot (gratis): Isaac le
// manda un mensaje a su número, recibe una "apikey" y la pega en la pantalla
// junto con su celular. Sus mensajes solo le llegan a ÉL.

const URL_ATENCION = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || "daymart-crm.vercel.app"}/mercadolibre/atencion`;

/** Celular de México → "+52XXXXXXXXXX" (acepta espacios, guiones, +52, 521…). */
export function normalizarCelular(texto: string) {
  let d = texto.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("521")) d = "52" + d.slice(3);
  if (d.length === 10) d = "52" + d;
  return d.length >= 11 ? `+${d}` : null;
}

async function mandarWhatsapp(telefono: string, apikey: string, texto: string) {
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(telefono)}&text=${encodeURIComponent(texto)}&apikey=${encodeURIComponent(apikey)}`;
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  const cuerpo = (await r.text().catch(() => "")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!r.ok || /error|invalid|not allowed/i.test(cuerpo)) throw new Error(`WhatsApp (CallMeBot) no lo mandó: ${cuerpo.slice(0, 200) || r.status}`);
}

/** Guarda el celular y la apikey SOLO si el mensaje de prueba sí sale. */
export async function conectarWhatsapp(telefonoTexto: string, apikey: string) {
  const telefono = normalizarCelular(telefonoTexto);
  if (!telefono) throw new Error("Escribe tu celular a 10 dígitos (ej. 55 1234 5678).");
  if (!apikey.trim()) throw new Error("Falta la apikey que te mandó CallMeBot por WhatsApp.");
  await mandarWhatsapp(telefono, apikey.trim(), "✅ Listo: aquí te van a llegar las preguntas de Mercado Libre de Daymart.");
  const supabase = createServiceClient();
  const { error } = await supabase.from("mercadolibre_atencion_config").upsert({ id: 1, whatsapp_telefono: telefono, whatsapp_apikey: apikey.trim(), actualizado_en: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return telefono;
}

export async function desconectarWhatsapp() {
  const supabase = createServiceClient();
  await supabase.from("mercadolibre_atencion_config").upsert({ id: 1, whatsapp_telefono: null, whatsapp_apikey: null, actualizado_en: new Date().toISOString() });
}

/** Avisa al celular las preguntas pendientes que todavía no se avisaron
 * (con su borrador si ya lo hay; si la IA no está, igual avisa). */
export async function avisarPreguntasNuevas() {
  const config = await obtenerConfigAtencion();
  if (!config.whatsapp_telefono || !config.whatsapp_apikey) return 0;
  const supabase = createServiceClient();
  const hace10 = new Date(Date.now() - 10 * 60000).toISOString();
  const { data } = await supabase
    .from("mercadolibre_preguntas")
    .select("id, item_id, texto, borrador, confianza, fecha_creacion, borrador_generado_en")
    .eq("estado", "PENDIENTE")
    .is("avisado_en", null)
    .order("fecha_creacion", { ascending: true })
    .limit(5)
    .returns<Pick<PreguntaMl, "id" | "item_id" | "texto" | "borrador" | "confianza" | "fecha_creacion" | "borrador_generado_en">[]>();
  // Espera el borrador hasta 10 minutos; después avisa aunque no haya.
  const listas = (data ?? []).filter((p) => p.borrador || p.borrador_generado_en || !iaConfigurada() || p.fecha_creacion < hace10);
  if (!listas.length) return 0;
  const { data: pubs } = await supabase.from("mercadolibre_publicaciones").select("item_id, titulo").in("item_id", listas.map((p) => p.item_id)).returns<{ item_id: string; titulo: string | null }[]>();
  const titulo = new Map((pubs ?? []).map((x) => [x.item_id, x.titulo]));
  let avisadas = 0;
  for (const p of listas) {
    const lineas = [`❓ Pregunta en Mercado Libre`, `📦 ${titulo.get(p.item_id) ?? p.item_id}`, ``, `“${p.texto}”`];
    if (p.borrador) lineas.push(``, `✍️ Respuesta lista (${p.confianza ?? "?"}):`, p.borrador);
    lineas.push(``, `Aprobar o corregir: ${URL_ATENCION}`);
    try {
      await mandarWhatsapp(config.whatsapp_telefono, config.whatsapp_apikey, lineas.join("\n"));
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

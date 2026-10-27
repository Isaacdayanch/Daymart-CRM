// El Director Meli DENTRO del CRM (27 oct; Isaac: "¿por qué no lo abro en un
// chat en la página donde dice Director Meli… sin volverme loco con APIs de
// WhatsApp?"). El CRM habla con Claude (misma llave ANTHROPIC_API_KEY que
// Atención a clientes) con el manual del Director y herramientas para leer el
// CRM, dejar propuestas, registrar las decisiones de Isaac y guardar reglas.
//
// Reglas:
// - Isaac escribe en /director; cada turno queda guardado en `director_chat`.
// - Tope diario de gasto propio (`director_config.limite_diario_usd`), aparte
//   del de Atención a clientes; cada llamada se anota en mercadolibre_ia_gastos
//   con origen DIRECTOR.
// - Un turno trabaja máximo ~45 s (las funciones de Vercel se cortan a 60 s):
//   si se acaba el tiempo, se le pide que conteste con lo que tiene.
// - Nada se ejecuta en ML desde aquí sin pasar por las propuestas: el Director
//   solo puede crear propuestas y registrar lo que Isaac decide; lo aprobado
//   lo ejecuta el CRM con las mismas reglas de la fase 2.

import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/servicio";
import { costoDeUso, iaConfigurada, MODELO_IA } from "@/lib/ia-respuestas";
import { anotarGastoIa, gastoIaHoy } from "@/lib/mercadolibre-preguntas";
import { cargarDatosDirector, type DatosDirector } from "@/lib/director-datos";
import { guardarPropuestas } from "@/lib/director-propuestas";
import { registrarDecisiones, textoResultadoDecisiones, type DecisionExterna } from "@/lib/director-decidir";
import { promocionesDeItem } from "@/lib/mercadolibre-promociones";
import { MANUAL_DIRECTOR, PETICION_MANANA } from "@/lib/director-manual";
import { mensajeErrorDirector } from "@/lib/director";
import { fechaTextoMx, ZONA_MX } from "@/lib/fechas-mx";
import type { ConfigDirector, MensajeChatDirector } from "@/lib/tipos";

export const LIMITE_DIRECTOR_DEFAULT = 2;
export const LIMITE_DIRECTOR_MAXIMO = 5;
/** Lo que puede costar UNA llamada en el peor caso (contexto grande + salida):
 * se aparta antes de llamar para no pasarse del tope. */
export const COSTO_MAXIMO_LLAMADA = 0.2;
const MAX_VUELTAS = 10;
const PRESUPUESTO_MS_DEFAULT = 45000;
const MAX_CARACTERES_RESULTADO = 60000;

export class TopeDirector extends Error {}

export function faltaSqlDirectorChat(mensaje: string) {
  return /director_chat|director_config/.test(mensaje) && /does not exist|schema cache/i.test(mensaje);
}

// ---------------------------------------------------------------------------
// Configuración y gasto
// ---------------------------------------------------------------------------

export async function obtenerConfigDirector(): Promise<ConfigDirector & { faltaSql: boolean }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("director_config").select("reglas, limite_diario_usd, lista_manana, hora_manana, ultima_manana").eq("id", 1).maybeSingle<ConfigDirector>();
  const faltaSql = Boolean(error && faltaSqlDirectorChat(error.message));
  return {
    reglas: data?.reglas ?? null,
    limite_diario_usd: Math.min(LIMITE_DIRECTOR_MAXIMO, Number(data?.limite_diario_usd ?? LIMITE_DIRECTOR_DEFAULT) || LIMITE_DIRECTOR_DEFAULT),
    lista_manana: data?.lista_manana ?? true,
    hora_manana: data?.hora_manana ?? "08:25",
    ultima_manana: data?.ultima_manana ?? null,
    faltaSql,
  };
}

export async function guardarConfigDirector(cambios: Partial<Pick<ConfigDirector, "reglas" | "limite_diario_usd" | "lista_manana" | "hora_manana">>) {
  if (cambios.limite_diario_usd !== undefined && (!(cambios.limite_diario_usd > 0) || cambios.limite_diario_usd > LIMITE_DIRECTOR_MAXIMO)) {
    throw new Error(`El tope diario debe estar entre $0.01 y $${LIMITE_DIRECTOR_MAXIMO} USD.`);
  }
  if (cambios.hora_manana !== undefined && !/^\d{2}:\d{2}$/.test(cambios.hora_manana)) throw new Error("La hora debe ir como HH:MM (ej. 08:25).");
  const supabase = createServiceClient();
  const { error } = await supabase.from("director_config").upsert({ id: 1, ...cambios, actualizado_en: new Date().toISOString() });
  if (error) throw new Error(faltaSqlDirectorChat(error.message) ? "Falta correr el SQL 0060 en Supabase (chat del Director)." : error.message);
}

/** Agrega una regla de Isaac (con fecha) a las del CRM. */
export async function guardarReglaDirector(regla: string) {
  const texto = regla.trim().replace(/\s+/g, " ");
  if (!texto) throw new Error("La regla viene vacía.");
  const config = await obtenerConfigDirector();
  const linea = `- (${fechaTextoMx(new Date())}) ${texto}`;
  await guardarConfigDirector({ reglas: config.reglas?.trim() ? `${config.reglas.trim()}\n${linea}` : linea });
  return linea;
}

export function gastoDirectorHoy() {
  return gastoIaHoy("DIRECTOR");
}

export function mensajeTopeDirector(limite: number) {
  return `Hoy ya se usó el tope de $${limite.toFixed(2)} USD del Director. Mañana (horario de la CDMX) vuelve a contestar, o súbele el tope aquí abajo.`;
}

// ---------------------------------------------------------------------------
// El chat guardado
// ---------------------------------------------------------------------------

export async function mensajesChatDirector(limite = 80): Promise<{ mensajes: MensajeChatDirector[]; faltaSql: boolean; error: string | null }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("director_chat").select("*").order("creado_en", { ascending: false }).limit(limite).returns<MensajeChatDirector[]>();
  if (error) return { mensajes: [], faltaSql: faltaSqlDirectorChat(error.message), error: error.message };
  return { mensajes: (data ?? []).reverse(), faltaSql: false, error: null };
}

async function guardarMensaje(fila: { rol: MensajeChatDirector["rol"]; texto: string; acciones?: string[]; costo_usd?: number | null; error?: string | null; origen: MensajeChatDirector["origen"] }) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("director_chat")
    .insert({ rol: fila.rol, texto: fila.texto, acciones: fila.acciones ?? [], costo_usd: fila.costo_usd ?? null, error: fila.error ?? null, origen: fila.origen })
    .select("id")
    .single<{ id: string }>();
  if (error) throw new Error(faltaSqlDirectorChat(error.message) ? "Falta correr el SQL 0060 en Supabase (chat del Director)." : error.message);
  return data.id;
}

/** Borra la conversación (las propuestas, la bitácora y las reglas se quedan). */
export async function borrarChatDirector() {
  const supabase = createServiceClient();
  const { error } = await supabase.from("director_chat").delete().not("id", "is", null);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Herramientas del Director
// ---------------------------------------------------------------------------

const BLOQUES = ["resumen", "ventas", "publicaciones", "analisis", "stock", "contenedores", "propuestas", "ligas_pendientes", "promociones_crm", "finanzas"] as const;
const FILTROS_PUBLICACIONES = ["todas", "abajo_margen", "sin_ventas_14", "full_por_acabarse", "mas_vendidas", "en_promocion", "sin_ligar"] as const;

const HERRAMIENTAS: Anthropic.Beta.BetaTool[] = [
  {
    name: "leer_crm",
    description:
      "Lee el CRM de Daymart por bloques (todo calculado con las mismas reglas que las pantallas, en horario de la Ciudad de México). Empieza por «resumen» (chico: ventas de ayer y 7 días, totales de stock, cuántas publicaciones están abajo del margen o sin ventas, Full por acabarse, ligas pendientes, preguntas, contenedores por llegar, vencimientos y propuestas pendientes). Luego pide solo lo que necesites: «publicaciones» (activas con precio base, si está en promo, comisión, envío, costo, te_queda, margen_pct, Full y días de Full, vendidas 30/14 días, en_bodega, sku_crm; usa filtro y buscar), «analisis» (ventas por día disponible, stock hoy, dias_alcanza, sugerido_pedir), «stock» (bodega, Full, costo promedio por SKU), «ventas», «contenedores», «propuestas» (pendientes, decididas sin reportar, decididas en 7 días), «ligas_pendientes», «promociones_crm» (descuentos del vendedor vigentes), «finanzas».",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        bloque: { type: "string", enum: [...BLOQUES] },
        filtro: {
          type: ["string", "null"],
          description: "Solo para publicaciones (" + FILTROS_PUBLICACIONES.join(", ") + "), analisis (todas | por_pedir) y stock (todos | reordenar). null = sin filtro.",
        },
        buscar: { type: ["string", "null"], description: "Texto para filtrar por título, SKU, código ML o número de publicación (sin acentos). null = sin buscador." },
        limite: { type: ["integer", "null"], description: "Máximo de renglones (por defecto 40, máximo 120)." },
      },
      required: ["bloque", "filtro", "buscar", "limite"],
      additionalProperties: false,
    },
  },
  {
    name: "promociones_de_ml",
    description:
      "Consulta en Mercado Libre, en este momento, las promociones que ML le ofrece o tiene activas a cada publicación (relámpago LIGHTNING, DEAL, campañas con aporte, descuento del vendedor PRICE_DISCOUNT): id, tipo, estado (candidate = se puede participar; started/active = ya está), vigencia, precio sugerido, mínimo y máximo, y qué % pone ML. Máximo 10 publicaciones por llamada; pídelo solo para las que vas a proponer.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { item_ids: { type: "array", items: { type: "string" }, description: "Números de publicación con MLM (ej. MLM2230571531)." } },
      required: ["item_ids"],
      additionalProperties: false,
    },
  },
  {
    name: "crear_propuestas",
    description:
      "Deja en el CRM la lista de propuestas para que Isaac las apruebe en la pantalla (o aquí en el chat). Devuelve el número (orden) de cada una: ese número es el que Isaac ve y con el que te contesta. Las propuestas de días anteriores sin decidir caducan solas. Una sola llamada por lista; máximo 60.",
    input_schema: {
      type: "object",
      properties: {
        propuestas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              area: { type: "string", enum: ["RELAMPAGO", "FULL", "PROMOCION", "PUBLICIDAD", "PUBLICACION", "LIGA", "AVISO", "OTRO"] },
              titulo: { type: "string", description: "Corto, con el producto y el precio si aplica (máx. 200)." },
              detalle: { type: "string", description: "Precio → recibes → ganas $ y %; o qué hacer exactamente si es manual." },
              porque: { type: "string", description: "El porqué en pocas palabras." },
              accion_tipo: { type: "string", enum: ["MANUAL", "PROMOCION_DESCUENTO", "PARTICIPAR_PROMOCION", "QUITAR_PROMOCION"] },
              item_id: { type: "string" },
              sku_crm: { type: "string" },
              precio_propuesto: { type: "number" },
              datos: { type: "object", description: "Lo que el CRM necesita para ejecutar (item_id, precio, precio_base, precio_minimo, fin, promotion_type, promotion_id, margen_pct…)." },
            },
            required: ["area", "titulo", "accion_tipo"],
          },
        },
      },
      required: ["propuestas"],
    },
  },
  {
    name: "decidir_propuestas",
    description:
      "Registra lo que Isaac decidió en el chat sobre las propuestas pendientes, por su número del día. Convención de Isaac: dice los números que NO quiere y todo lo demás se aprueba al precio propuesto; «va»/«ok» = aprobar todas; «no»/«nada» = rechazar todas; «la 4 a 1990» = aprobar la 4 con ese precio. Lo aprobado con acción automática se aplica en Mercado Libre en el acto y el resultado viene en la respuesta (repórtalo tal cual).",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        decisiones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              orden: { type: "integer", description: "Número del día de la propuesta." },
              decision: { type: "string", enum: ["APROBAR", "RECHAZAR"] },
              precio: { type: ["number", "null"], description: "Solo si Isaac cambió el precio; null = el propuesto." },
              nota: { type: ["string", "null"] },
            },
            required: ["orden", "decision", "precio", "nota"],
            additionalProperties: false,
          },
        },
      },
      required: ["decisiones"],
      additionalProperties: false,
    },
  },
  {
    name: "guardar_regla",
    description: "Guarda una regla nueva de Isaac (una decisión que debes respetar de aquí en adelante: productos que no se tocan, precios fijos, cambios al calendario, cómo quiere las listas). Se guarda con la fecha de hoy y la verás en tu manual en los siguientes turnos. Solo cuando Isaac la diga, no por tu cuenta.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { regla: { type: "string", description: "La regla en una o dos frases, tal como la aplicarías." } },
      required: ["regla"],
      additionalProperties: false,
    },
  },
];

function sinAcentos(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function coincide(buscar: string | null, ...campos: unknown[]) {
  if (!buscar?.trim()) return true;
  const b = sinAcentos(buscar.trim());
  return campos.some((c) => c !== null && c !== undefined && sinAcentos(String(c)).includes(b));
}

function limiteDe(n: number | null | undefined, porDefecto: number) {
  if (!n || !Number.isFinite(n)) return porDefecto;
  return Math.max(1, Math.min(120, Math.floor(n)));
}

type Fila = Record<string, unknown>;
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : []);
const num = (x: unknown) => (typeof x === "number" ? x : null);

/** Lo que devuelve `leer_crm` para cada bloque. Recorta las publicaciones y
 * los análisis (son cientos de renglones) a lo que el Director pidió. */
export function bloqueDe(datos: DatosDirector, bloque: string, filtro: string | null, buscar: string | null, limite: number | null): unknown {
  const pubs = (datos.publicaciones as { margen_minimo_pct?: number; activas?: number; lista?: Fila[] } | undefined) ?? {};
  const listaPubs = lista(pubs.lista);
  const analisis = (datos.analisis_30_dias as { dias_espera?: number; primera_foto?: string | null; filas?: Fila[] } | undefined) ?? {};
  const filasAnalisis = lista(analisis.filas);
  const stock = (datos.stock as { dias_espera?: number; valor_bodega?: number; valor_full?: number; piezas_full?: number; inventarios_full_sin_ligar?: number; productos?: Fila[] } | undefined) ?? {};
  const productos = lista(stock.productos);
  const propuestas = (datos.propuestas as { pendientes?: Fila[]; decididas_sin_reportar?: Fila[]; decididas_7_dias?: Fila[] } | undefined) ?? {};
  const ligas = (datos.ligas_pendientes as { total?: number } | undefined) ?? {};

  const compactaPub = (p: Fila) => ({
    item_id: p.item_id,
    titulo: typeof p.titulo === "string" ? p.titulo.slice(0, 70) : p.titulo,
    variacion: p.variacion ?? undefined,
    seller_sku: p.seller_sku ?? undefined,
    tipo: p.tipo_publicacion ?? undefined,
    logistica: p.logistica,
    precio: p.precio,
    precio_base: p.precio_base,
    en_promocion: p.en_promocion,
    comision_pct: p.comision_pct,
    comision_fija: p.comision_fija ?? undefined,
    envio: p.envio_promedio,
    costo: p.costo,
    te_queda: p.te_queda,
    margen_pct: p.margen_pct,
    abajo_del_margen_minimo: p.abajo_del_margen_minimo,
    full: p.full_disponible,
    codigo_ml: p.inventory_id ?? undefined,
    cantidad_publicada: p.cantidad_publicada,
    vendidas_30: p.vendidas_30_dias,
    vendidas_14: p.vendidas_14_dias,
    dias_de_full: p.dias_de_full,
    en_bodega: p.en_bodega,
    sku_crm: p.sku_crm,
    nombre_crm: p.nombre_crm ?? undefined,
  });

  switch (bloque) {
    case "resumen": {
      const conStock = (p: Fila) => (num(p.full_disponible) ?? 0) > 0 || (num(p.en_bodega) ?? 0) > 0 || (num(p.cantidad_publicada) ?? 0) > 0;
      return {
        hoy: datos.hoy,
        dia_semana: datos.dia_semana,
        mercadolibre_conectado: datos.mercadolibre_conectado,
        ventas_ml: datos.ventas_ml,
        stock: { dias_espera: stock.dias_espera, valor_bodega: stock.valor_bodega, valor_full: stock.valor_full, piezas_full: stock.piezas_full, inventarios_full_sin_ligar: stock.inventarios_full_sin_ligar, productos_con_stock: productos.length },
        publicaciones: {
          margen_minimo_pct: pubs.margen_minimo_pct,
          activas: pubs.activas,
          abajo_del_margen_minimo: listaPubs.filter((p) => p.abajo_del_margen_minimo === true).length,
          sin_ventas_14_con_stock: listaPubs.filter((p) => num(p.vendidas_14_dias) === 0 && conStock(p)).length,
          full_por_acabarse_14_dias: listaPubs.filter((p) => num(p.dias_de_full) !== null && (num(p.dias_de_full) as number) <= 14).length,
          en_promocion: listaPubs.filter((p) => p.en_promocion === true).length,
          sin_ligar_al_crm: listaPubs.filter((p) => !p.sku_crm).length,
        },
        analisis_30_dias: { dias_espera: analisis.dias_espera, primera_foto: analisis.primera_foto, por_pedir: filasAnalisis.filter((f) => f.se_acaba_antes_del_pedido === true).length },
        promociones_crm_vigentes: lista(datos.promociones_crm).length,
        ligas_pendientes: ligas.total ?? 0,
        preguntas_sin_responder: datos.preguntas_sin_responder ?? null,
        contenedores_por_llegar: (datos.contenedores as { por_llegar?: unknown } | undefined)?.por_llegar ?? [],
        finanzas: datos.finanzas,
        propuestas: {
          pendientes: lista(propuestas.pendientes).map((p) => ({ orden: p.orden, area: p.area, titulo: p.titulo, precio_propuesto: p.precio_propuesto, accion_tipo: p.accion_tipo })),
          decididas_sin_reportar: lista(propuestas.decididas_sin_reportar).length,
          decididas_7_dias: lista(propuestas.decididas_7_dias).length,
        },
        errores: datos.errores,
      };
    }
    case "ventas":
      return datos.ventas_ml ?? { error: datos.errores.ventas_ml ?? "sin datos" };
    case "publicaciones": {
      const f = filtro && (FILTROS_PUBLICACIONES as readonly string[]).includes(filtro) ? filtro : "todas";
      let filas = listaPubs.filter((p) => coincide(buscar, p.titulo, p.variacion, p.sku_crm, p.seller_sku, p.item_id, p.inventory_id, p.nombre_crm));
      const conStock = (p: Fila) => (num(p.full_disponible) ?? 0) > 0 || (num(p.en_bodega) ?? 0) > 0 || (num(p.cantidad_publicada) ?? 0) > 0;
      if (f === "abajo_margen") filas = filas.filter((p) => p.abajo_del_margen_minimo === true).sort((a, b) => (num(a.margen_pct) ?? 0) - (num(b.margen_pct) ?? 0));
      else if (f === "sin_ventas_14") filas = filas.filter((p) => num(p.vendidas_14_dias) === 0 && conStock(p)).sort((a, b) => (num(b.full_disponible) ?? 0) + (num(b.en_bodega) ?? 0) - ((num(a.full_disponible) ?? 0) + (num(a.en_bodega) ?? 0)));
      else if (f === "full_por_acabarse") filas = filas.filter((p) => num(p.dias_de_full) !== null && (num(p.dias_de_full) as number) <= 14).sort((a, b) => (num(a.dias_de_full) ?? 0) - (num(b.dias_de_full) ?? 0));
      else if (f === "mas_vendidas") filas = [...filas].sort((a, b) => (num(b.vendidas_30_dias) ?? 0) - (num(a.vendidas_30_dias) ?? 0));
      else if (f === "en_promocion") filas = filas.filter((p) => p.en_promocion === true);
      else if (f === "sin_ligar") filas = filas.filter((p) => !p.sku_crm);
      else filas = [...filas].sort((a, b) => (num(b.vendidas_30_dias) ?? 0) - (num(a.vendidas_30_dias) ?? 0));
      const n = limiteDe(limite, 40);
      return { margen_minimo_pct: pubs.margen_minimo_pct, total_que_cumplen: filas.length, mostradas: Math.min(n, filas.length), lista: filas.slice(0, n).map(compactaPub) };
    }
    case "analisis": {
      let filas = filasAnalisis.filter((f) => coincide(buscar, f.titulo, f.variacion, f.sku_crm, Array.isArray(f.item_ids) ? f.item_ids.join(" ") : null));
      if (filtro === "por_pedir") filas = filas.filter((f) => f.se_acaba_antes_del_pedido === true);
      const n = limiteDe(limite, 40);
      return { dias_espera: analisis.dias_espera, primera_foto: analisis.primera_foto, total_que_cumplen: filas.length, mostradas: Math.min(n, filas.length), filas: filas.slice(0, n) };
    }
    case "stock": {
      let filas = productos.filter((p) => coincide(buscar, p.sku, p.nombre));
      if (filtro === "reordenar") filas = filas.filter((p) => p.reordenar === true);
      const n = limiteDe(limite, 60);
      return { dias_espera: stock.dias_espera, valor_bodega: stock.valor_bodega, valor_full: stock.valor_full, total_que_cumplen: filas.length, mostradas: Math.min(n, filas.length), productos: filas.slice(0, n) };
    }
    case "contenedores":
      return datos.contenedores ?? { error: datos.errores.contenedores ?? "sin datos" };
    case "propuestas":
      return datos.propuestas ?? { error: datos.errores.propuestas ?? "sin datos" };
    case "ligas_pendientes":
      return datos.ligas_pendientes ?? { error: datos.errores.ligas ?? "sin datos" };
    case "promociones_crm":
      return datos.promociones_crm ?? { error: datos.errores.promociones ?? "sin datos" };
    case "finanzas":
      return datos.finanzas ?? { error: datos.errores.finanzas ?? "sin datos" };
    default:
      return { error: `Bloque desconocido: ${bloque}. Válidos: ${BLOQUES.join(", ")}.` };
  }
}

function aTexto(valor: unknown) {
  const texto = JSON.stringify(valor);
  if (texto.length <= MAX_CARACTERES_RESULTADO) return texto;
  return texto.slice(0, MAX_CARACTERES_RESULTADO) + `… [recortado: pide menos renglones con «limite» o usa «buscar»]`;
}

interface ContextoTurno {
  datos: Promise<DatosDirector> | null;
  acciones: string[];
}

async function ejecutarHerramienta(nombre: string, entrada: Record<string, unknown>, ctx: ContextoTurno): Promise<string> {
  switch (nombre) {
    case "leer_crm": {
      if (!ctx.datos) ctx.datos = cargarDatosDirector();
      const datos = await ctx.datos;
      const bloque = String(entrada.bloque ?? "resumen");
      ctx.acciones.push(`Leyó el CRM: ${bloque}${typeof entrada.filtro === "string" && entrada.filtro ? ` (${entrada.filtro})` : ""}${typeof entrada.buscar === "string" && entrada.buscar ? ` «${entrada.buscar}»` : ""}`);
      return aTexto(bloqueDe(datos, bloque, typeof entrada.filtro === "string" ? entrada.filtro : null, typeof entrada.buscar === "string" ? entrada.buscar : null, typeof entrada.limite === "number" ? entrada.limite : null));
    }
    case "promociones_de_ml": {
      const ids = (Array.isArray(entrada.item_ids) ? entrada.item_ids : []).filter((x): x is string => typeof x === "string").slice(0, 10);
      if (!ids.length) return aTexto({ error: "Manda al menos un número de publicación (MLM…)." });
      ctx.acciones.push(`Consultó promociones de ML: ${ids.length} publicación${ids.length === 1 ? "" : "es"}`);
      const resultado = await Promise.all(
        ids.map(async (itemId) => {
          try {
            const promos = await promocionesDeItem(itemId);
            // Sin el JSON crudo de ML (es grande y el Director no lo necesita).
            return { item_id: itemId, promociones: promos.map((p) => ({ ...p, crudo: undefined })) };
          } catch (e) {
            return { item_id: itemId, error: e instanceof Error ? e.message : "No se pudo consultar." };
          }
        }),
      );
      return aTexto(resultado);
    }
    case "crear_propuestas": {
      const r = await guardarPropuestas(entrada.propuestas, { origen: "DIRECTOR" });
      const nums = r.propuestas.map((p) => p.orden);
      ctx.acciones.push(`Dejó ${r.propuestas.length} propuesta${r.propuestas.length === 1 ? "" : "s"} (#${Math.min(...nums)}–#${Math.max(...nums)})`);
      return aTexto({ ok: true, fecha: r.fecha, caducadas: r.caducadas, propuestas: r.propuestas.map((p) => ({ orden: p.orden, area: p.area, titulo: p.titulo, precio_propuesto: p.precio_propuesto })), pantalla: "https://daymart-crm.vercel.app/director" });
    }
    case "decidir_propuestas": {
      const crudas = Array.isArray(entrada.decisiones) ? (entrada.decisiones as Record<string, unknown>[]) : [];
      const decisiones: DecisionExterna[] = crudas.map((d) => ({
        orden: Number(d.orden),
        decision: d.decision === "RECHAZAR" ? "RECHAZAR" : "APROBAR",
        precio: d.precio === null || d.precio === undefined ? null : Number(d.precio),
        nota: typeof d.nota === "string" ? d.nota : null,
      }));
      const r = await registrarDecisiones(decisiones, "CHAT");
      ctx.acciones.push(`Registró tu decisión: ${r.aprobadas} aprobada${r.aprobadas === 1 ? "" : "s"}, ${r.rechazadas} rechazada${r.rechazadas === 1 ? "" : "s"}${r.ejecucion.length ? `, ${r.ejecucion.filter((e) => e.ok).length} aplicada${r.ejecucion.filter((e) => e.ok).length === 1 ? "" : "s"} en ML` : ""}`);
      return aTexto({ ...r, resumen: textoResultadoDecisiones(r) });
    }
    case "guardar_regla": {
      const linea = await guardarReglaDirector(String(entrada.regla ?? ""));
      ctx.acciones.push("Guardó una regla nueva");
      return aTexto({ ok: true, guardada: linea });
    }
    default:
      return aTexto({ error: `Herramienta desconocida: ${nombre}` });
  }
}

// ---------------------------------------------------------------------------
// El turno
// ---------------------------------------------------------------------------

function sistemaDinamico(config: ConfigDirector) {
  const ahora = new Date();
  const dia = new Intl.DateTimeFormat("es-MX", { timeZone: ZONA_MX, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(ahora);
  const hora = new Intl.DateTimeFormat("es-MX", { timeZone: ZONA_MX, hour: "2-digit", minute: "2-digit", hour12: false }).format(ahora);
  const partes = [`Hoy es ${dia}, ${hora} (Ciudad de México).`, `Pantalla de propuestas: https://daymart-crm.vercel.app/director`];
  if (config.reglas?.trim()) partes.push(`# Reglas nuevas que Isaac te dio en el chat (mandan sobre las de arriba si chocan)\n${config.reglas.trim()}`);
  return partes.join("\n\n");
}

function historialAMensajes(historial: MensajeChatDirector[]): Anthropic.Beta.BetaMessageParam[] {
  const mensajes: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of historial) {
    if (m.error) continue;
    const texto = m.texto.trim();
    if (!texto) continue;
    if (m.rol === "DIRECTOR") mensajes.push({ role: "assistant", content: texto });
    else if (m.rol === "ISAAC") mensajes.push({ role: "user", content: texto });
    else mensajes.push({ role: "user", content: `[Aviso del CRM] ${texto}` });
  }
  if (mensajes.length && mensajes[0].role !== "user") mensajes.unshift({ role: "user", content: "(inicio de la conversación)" });
  return mensajes;
}

function textoDe(contenido: Anthropic.Beta.BetaContentBlock[]) {
  return contenido
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("\n")
    .trim();
}

export interface RespuestaDirector {
  respuesta: string;
  acciones: string[];
  costoUsd: number;
  mensajeId: string | null;
}

/** Un turno del Director: guarda lo que dijo Isaac (o la petición de la
 * mañana), llama a Claude con las herramientas hasta que termine (o se acabe
 * el tiempo), guarda la respuesta y devuelve el texto. */
export async function responderAlDirector(opciones: { texto: string; origen: "CHAT" | "MANANA"; presupuestoMs?: number }): Promise<RespuestaDirector> {
  const inicio = Date.now();
  const presupuesto = opciones.presupuestoMs ?? PRESUPUESTO_MS_DEFAULT;
  if (!iaConfigurada()) throw new Error("Falta la llave ANTHROPIC_API_KEY en Vercel: sin ella el Director no puede contestar.");
  const config = await obtenerConfigDirector();
  if (config.faltaSql) throw new Error("Falta correr el SQL 0060 en Supabase (chat del Director).");
  const limite = config.limite_diario_usd;
  const gastoAntes = await gastoDirectorHoy();
  if (gastoAntes + COSTO_MAXIMO_LLAMADA > limite) throw new TopeDirector(mensajeTopeDirector(limite));

  const { mensajes: historial } = await mensajesChatDirector(40);
  const esManana = opciones.origen === "MANANA";
  await guardarMensaje({ rol: esManana ? "SISTEMA" : "ISAAC", texto: esManana ? "Revisión automática de la mañana." : opciones.texto, origen: opciones.origen });

  const mensajes = historialAMensajes(historial);
  mensajes.push({ role: "user", content: esManana ? PETICION_MANANA : opciones.texto });

  const client = new Anthropic();
  const ctx: ContextoTurno = { datos: null, acciones: [] };
  let costo = 0;
  let respuesta = "";
  let nota = "";
  let error: string | null = null;

  try {
    for (let vuelta = 1; vuelta <= MAX_VUELTAS; vuelta++) {
      const sinTiempo = Date.now() - inicio > presupuesto - 12000;
      const sinDinero = gastoAntes + costo + COSTO_MAXIMO_LLAMADA > limite;
      const ultima = vuelta === MAX_VUELTAS || sinTiempo || sinDinero;
      if (ultima) {
        const ultimo = mensajes[mensajes.length - 1];
        const aviso = sinDinero ? "[Aviso del CRM] Se llegó al tope de gasto de hoy: contesta ya con lo que tienes, sin usar más herramientas, y dile a Isaac que el resto queda para mañana o cuando suba el tope." : "[Aviso del CRM] Se acabó el tiempo de este turno: contesta ya con lo que tienes, sin usar más herramientas. Si falta algo, dilo en una línea.";
        if (ultimo.role === "user" && Array.isArray(ultimo.content)) ultimo.content.push({ type: "text", text: aviso });
        else mensajes.push({ role: "user", content: aviso });
      }
      const r = await client.beta.messages.create({
        model: MODELO_IA,
        max_tokens: 6000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: [
          { type: "text", text: MANUAL_DIRECTOR, cache_control: { type: "ephemeral" } },
          { type: "text", text: sistemaDinamico(config) },
        ],
        tools: HERRAMIENTAS,
        tool_choice: ultima ? { type: "none" } : { type: "auto" },
        messages: mensajes,
      });
      const costoLlamada = costoDeUso(r.usage);
      costo += costoLlamada;
      await anotarGastoIa("DIRECTOR", costoLlamada).catch(() => undefined);

      if (r.stop_reason === "refusal") {
        respuesta = textoDe(r.content) || "No puedo ayudar con eso.";
        nota = "La IA no quiso seguir con esta petición.";
        break;
      }
      const usos = r.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (r.stop_reason !== "tool_use" || usos.length === 0 || ultima) {
        respuesta = textoDe(r.content);
        if (r.stop_reason === "max_tokens") nota = "(La respuesta se cortó por larga: pídeme el resto.)";
        break;
      }
      mensajes.push({ role: "assistant", content: r.content });
      const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const uso of usos) {
        const entrada = uso.input && typeof uso.input === "object" ? (uso.input as Record<string, unknown>) : {};
        try {
          resultados.push({ type: "tool_result", tool_use_id: uso.id, content: await ejecutarHerramienta(uso.name, entrada, ctx) });
        } catch (e) {
          const mensaje = e instanceof Error ? mensajeErrorDirector(e) : "Falló la herramienta.";
          ctx.acciones.push(`Error en ${uso.name}: ${mensaje}`);
          resultados.push({ type: "tool_result", tool_use_id: uso.id, is_error: true, content: mensaje });
        }
      }
      mensajes.push({ role: "user", content: resultados });
    }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) error = "La llave ANTHROPIC_API_KEY no es válida: revísala en Vercel.";
    else if (e instanceof Anthropic.RateLimitError) error = "La IA está saturada en este momento: inténtalo en unos minutos.";
    else if (e instanceof Anthropic.APIError) error = `La IA respondió con error ${e.status ?? ""}: ${e.message}`.trim();
    else error = e instanceof Error ? e.message : "No se pudo contestar.";
  }

  if (error) {
    const id = await guardarMensaje({ rol: "SISTEMA", texto: `No pude contestar: ${error}`, acciones: ctx.acciones, costo_usd: costo || null, error, origen: opciones.origen }).catch(() => null);
    return { respuesta: `No pude contestar: ${error}`, acciones: ctx.acciones, costoUsd: costo, mensajeId: id };
  }
  const textoFinal = [respuesta || "(Sin respuesta: inténtalo otra vez.)", nota].filter(Boolean).join("\n\n");
  const id = await guardarMensaje({ rol: "DIRECTOR", texto: textoFinal, acciones: ctx.acciones, costo_usd: costo, origen: opciones.origen });
  return { respuesta: textoFinal, acciones: ctx.acciones, costoUsd: costo, mensajeId: id };
}

// ---------------------------------------------------------------------------
// La lista de la mañana (la arma el reloj del CRM)
// ---------------------------------------------------------------------------

/** Si ya es la hora de la mañana (CDMX) y hoy no se ha corrido, corre la
 * revisión automática y deja la lista en el chat y en las propuestas. La
 * marca `ultima_manana` se escribe ANTES de llamar a la IA, para que dos
 * relojes no la corran dos veces. Devuelve null si no tocaba. */
export async function corridaManana(presupuestoMs = 45000): Promise<RespuestaDirector | { omitida: string } | null> {
  const config = await obtenerConfigDirector();
  if (config.faltaSql || !config.lista_manana) return null;
  if (!iaConfigurada()) return null;
  const ahora = new Date();
  const hoy = fechaTextoMx(ahora);
  if (config.ultima_manana === hoy) return null;
  const hora = new Intl.DateTimeFormat("es-MX", { timeZone: ZONA_MX, hour: "2-digit", minute: "2-digit", hour12: false }).format(ahora).replace(/^24/, "00");
  if (hora < config.hora_manana) return null;
  const supabase = createServiceClient();
  const { data } = await supabase.from("director_config").update({ ultima_manana: hoy }).eq("id", 1).neq("ultima_manana", hoy).select("id");
  if (!data?.length) {
    // `neq` no empata con null: segundo intento para la primera vez.
    const { data: d2 } = await supabase.from("director_config").update({ ultima_manana: hoy }).eq("id", 1).is("ultima_manana", null).select("id");
    if (!d2?.length) return null;
  }
  try {
    return await responderAlDirector({ texto: PETICION_MANANA, origen: "MANANA", presupuestoMs });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Falló la revisión de la mañana.";
    await guardarMensaje({ rol: "SISTEMA", texto: `La revisión automática de la mañana no se pudo hacer: ${mensaje}`, error: mensaje, origen: "MANANA" }).catch(() => undefined);
    return { omitida: mensaje };
  }
}

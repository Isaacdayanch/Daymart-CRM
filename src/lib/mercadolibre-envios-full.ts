// Envíos a Full de Mercado Libre, en DOS momentos (Isaac, 8 oct: "le
// ponemos que están en camino y ya posteriormente que ya llegó; si no lo
// registramos hasta que ya llegó, directamente le registramos que ya llegó").
//
//  1) SALE  → Isaac pega la tabla del envío desde "Gestión de envíos Full"
//            (número + fecha en que salió) y la bodega se descuenta EN ESE
//            MOMENTO con las piezas DECLARADAS: una SALIDA destino "Full"
//            por producto, ligada por `inbound_ml_id`, con fecha = salió.
//  2) LLEGA → "ML lo recibió completo" (un clic) o se pega la tabla ya con
//            "Aptas para Full". Cada diferencia se decide: se quedó en
//            bodega (la salida baja a lo recibido) o merma (la salida baja
//            y se registra una SALIDA destino "Merma"). El envío queda
//            `cerrado_en`.
//  Si se captura cuando ya llegó, los dos momentos pasan juntos.
//  Lo que no está ligado a un producto del CRM no se pierde: la línea queda
//  "sin ligar" y su salida se genera sola (`generarSalidasPendientesEnvios`)
//  en cuanto Isaac la liga.
//
//  La lectura automática por la API de ML se quitó (7–8 oct): ML no da el
//  contenido de los envíos por API (todos los caminos contestan 404 y
//  `/stock/fulfillment/operations/search` solo trae traslados internos y
//  gasta la cuota; ver CLAUDE.md). Todo corre con la service role.

import { createServiceClient } from "@/lib/supabase/servicio";
import { insertarMovimientosStock } from "@/lib/movimientos-stock";
import { obtenerPublicaciones, type PublicacionMl } from "@/lib/mercadolibre-stock";
import { resolvedorSku } from "@/lib/salidas-ml";
import type { Bodega, RecepcionFull } from "@/lib/tipos";

const DIA_MS = 86400000;
/** Días en camino a partir de los cuales se avisa que falta cerrar el envío. */
export const DIAS_EN_CAMINO_AVISO = 10;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type EstadoEnvioMl = "PLANEADO" | "COLECTADO" | "RECIBIDO" | "CONTADO" | "CANCELADO" | "DESCONOCIDO";

export const ETIQUETA_ESTADO_ENVIO_ML: Record<EstadoEnvioMl, string> = {
  PLANEADO: "Planeado",
  COLECTADO: "En camino a Full",
  RECIBIDO: "Recibido en Full",
  CONTADO: "Contado en Full",
  CANCELADO: "Cancelado",
  DESCONOCIDO: "Sin estatus",
};

export type DecisionDiferencia = "QUEDO_EN_BODEGA" | "MERMA";
export type MomentoEnvio = "EN_CAMINO" | "LLEGO";

export interface EnvioFullMl {
  inbound_id: string;
  estado: EstadoEnvioMl;
  estado_ml: string | null;
  fecha_creacion: string | null;
  fecha_recepcion: string | null;
  piezas_planeadas: number | null;
  piezas_recibidas: number;
  origen: string | null;
  crudo: Record<string, unknown> | null;
  /** Salida de bodega registrada (momento 1). */
  confirmado_en: string | null;
  /** Isaac dijo que este envío no salió de su bodega (ej. devolución a Full). */
  ignorado_en: string | null;
  /** Fecha en que salió de la bodega (fecha de las salidas). */
  salio_en?: string | null;
  /** Llegada conciliada: diferencias decididas (momento 2). */
  cerrado_en?: string | null;
  actualizado_en: string;
}

export interface EnvioFullMlLinea {
  id: string;
  inbound_id: string;
  operacion_id: string;
  inventory_id: string | null;
  item_id: string | null;
  variation_id: number | null;
  titulo: string | null;
  seller_sku: string | null;
  imagen_url: string | null;
  /** Declaradas en el panel de ML (unidades de ML). */
  cantidad_planeada: number | null;
  /** Aptas para Full según ML (unidades de ML); 0 mientras va en camino. */
  cantidad_recibida: number;
  fecha: string | null;
  crudo: Record<string, unknown> | null;
  /** Salida de bodega que generó esta línea (para ajustarla al cerrar). */
  salida_movimiento_id?: string | null;
  salida_generada_en?: string | null;
  diferencia_decision?: DecisionDiferencia | null;
}

/** En qué paso va el envío, para la pantalla y los avisos. */
export type FaseEnvio = "PENDIENTE_REGISTRAR" | "EN_CAMINO" | "POR_CERRAR" | "CERRADO" | "IGNORADO" | "CANCELADO";

export function faseDe(envio: EnvioFullMl): FaseEnvio {
  if (envio.ignorado_en) return "IGNORADO";
  if (envio.estado === "CANCELADO") return "CANCELADO";
  if (!envio.confirmado_en) return "PENDIENTE_REGISTRAR";
  if (envio.cerrado_en) return "CERRADO";
  if (envio.estado === "RECIBIDO" || envio.estado === "CONTADO") return "POR_CERRAR";
  return "EN_CAMINO";
}

/** Declaradas − recibidas (positivo = ML recibió MENOS de lo declarado). Solo tiene sentido cuando ya llegó. */
export function diferenciaLinea(l: { cantidad_planeada: number | null; cantidad_recibida: number }) {
  if (l.cantidad_planeada === null) return 0;
  return l.cantidad_planeada - l.cantidad_recibida;
}

export function diasEnCamino(envio: EnvioFullMl, ahora = Date.now()) {
  const desde = envio.salio_en ?? envio.confirmado_en ?? envio.fecha_creacion;
  if (!desde) return 0;
  return Math.floor((ahora - new Date(desde).getTime()) / DIA_MS);
}

// ---------------------------------------------------------------------------
// Leer la tabla pegada del panel de ML
// ---------------------------------------------------------------------------

export interface LineaPanelMl {
  /** "Código ML" del panel = inventory_id de Full. */
  inventoryId: string;
  titulo: string;
  declaradas: number;
  /** Aptas para Full (si el envío todavía no llega, viene igual a declaradas). */
  recibidas: number;
}

/** Lee el texto copiado del panel "Gestión de envíos Full" de Mercado
 * Libre (Isaac selecciona la tabla, copia y pega). Cada producto empieza
 * con "Código ML: XXXX" (= inventory_id) y trae las columnas Declaradas,
 * Procesadas, Diferencias y Aptas para Full como "150 u."; se toma
 * Declaradas (lo que salió) y Aptas (lo que de verdad quedó en Full).
 * Puro, sin base de datos; probado con la captura real del 7 oct. */
export function parsearPanelEnvioMl(texto: string): LineaPanelMl[] {
  // "1 u. menos de las declaradas" / "2 u. más" son etiquetas, no columnas.
  const limpio = texto.replace(/(\d[\d,.]*)\s*u\.?\s*(de\s+)?(menos|m[aá]s)\b/gi, "");
  const partes = limpio.split(/c[oó]digo\s*ml\s*:?\s*/i);
  const lineas: LineaPanelMl[] = [];
  for (const parte of partes.slice(1)) {
    const codigo = parte.match(/^\s*([A-Z0-9]{6,12})/i)?.[1]?.toUpperCase();
    if (!codigo) continue;
    // La fila "Total" (al final) no es del último producto: se corta ahí.
    const resto = parte.slice(parte.indexOf(codigo) + codigo.length).split(/(?:^|\r?\n)\s*total\b/i)[0];
    const numeros = Array.from(resto.matchAll(/(\d[\d,.]*)\s*u\b/gi)).map((m) => Number(m[1].replace(/,/g, "")));
    if (!numeros.length) continue;
    // Declaradas, Procesadas, Diferencias, Aptas. Si el envío va en camino
    // solo viene Declaradas (las demás "-"), y Aptas queda = Declaradas.
    const recibidas = numeros[Math.min(numeros.length, 4) - 1];
    const titulo =
      resto
        .replace(/^\s*\+\d+/, "")
        .split(/\r?\n|\t/)
        .map((t) => t.trim())
        .find((t) => t && !/cm\s*3|cm³|^\d[\d,.]*\s*u\b/i.test(t)) ?? codigo;
    lineas.push({ inventoryId: codigo, titulo, declaradas: numeros[0], recibidas: Number.isFinite(recibidas) ? recibidas : numeros[0] });
  }
  // Un mismo código repetido (ej. pegó dos veces) se queda con el último.
  const porCodigo = new Map(lineas.map((l) => [l.inventoryId, l]));
  return Array.from(porCodigo.values());
}

// ---------------------------------------------------------------------------
// Ayudas
// ---------------------------------------------------------------------------

function mensajeSql(error: { message: string } | null | undefined): string | null {
  if (!error) return null;
  if (/salio_en|cerrado_en|salida_movimiento_id|salida_generada_en|diferencia_decision/.test(error.message) && /column|schema cache/i.test(error.message)) {
    return `Falta correr el SQL 0049 en Supabase (${error.message})`;
  }
  return error.message;
}

function limpiarNumero(numero: string) {
  return numero.trim().replace(/^#/, "").replace(/[^0-9A-Za-z_-]/g, "");
}

/** Mediodía de ese día en CDMX, para que la fecha no se brinque de día. */
function instanteSalida(fecha?: string | null) {
  if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) return new Date(`${fecha}T12:00:00-06:00`).toISOString();
  return new Date().toISOString();
}

async function bodegaPrincipal(): Promise<Bodega | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("bodegas").select("*").is("eliminado_en", null).order("creado_en").limit(1).maybeSingle<Bodega>();
  return data ?? null;
}

async function publicacionesPorInventario() {
  const publicaciones = await obtenerPublicaciones().catch(() => [] as PublicacionMl[]);
  const porInventario = new Map<string, PublicacionMl>();
  for (const p of publicaciones) {
    if (p.inventory_id && (!porInventario.has(p.inventory_id) || (porInventario.get(p.inventory_id)!.catalogo && !p.catalogo))) porInventario.set(p.inventory_id, p);
  }
  return porInventario;
}

async function cargarEnvio(inboundId: string): Promise<{ envio: EnvioFullMl; lineas: EnvioFullMlLinea[] } | null> {
  const supabase = createServiceClient();
  const { data: envio } = await supabase.from("mercadolibre_envios_full").select("*").eq("inbound_id", inboundId).maybeSingle<EnvioFullMl>();
  if (!envio) return null;
  const { data: lineas } = await supabase.from("mercadolibre_envios_full_lineas").select("*").eq("inbound_id", inboundId).order("creado_en").returns<EnvioFullMlLinea[]>();
  return { envio, lineas: lineas ?? [] };
}

interface Ficha {
  nombre: string;
  imagen_url: string | null;
  piezas_por_caja: number;
}

/** Nombre/foto/piezas por caja de cada SKU, de su último movimiento. */
async function fichasPorSku(skus: string[]): Promise<Map<string, Ficha>> {
  const supabase = createServiceClient();
  const fichas = new Map<string, Ficha>();
  if (!skus.length) return fichas;
  const { data } = await supabase
    .from("movimientos_stock")
    .select("sku, nombre, imagen_url, piezas_por_caja")
    .in("sku", skus)
    .order("creado_en", { ascending: false })
    .returns<(Ficha & { sku: string })[]>();
  for (const f of data ?? []) if (!fichas.has(f.sku)) fichas.set(f.sku, f);
  return fichas;
}

/** Marca atendidas las subidas en Full (detectadas por diferencia de totales
 * en cada sincronización de publicaciones) que este envío explica. */
async function atenderRecepcionesDeEnvio(lineas: EnvioFullMlLinea[], desdeIso: string | null) {
  const supabase = createServiceClient();
  const inventarios = Array.from(new Set(lineas.map((l) => l.inventory_id).filter((x): x is string => Boolean(x))));
  if (!inventarios.length) return;
  const desde = new Date(new Date(desdeIso ?? Date.now()).getTime() - DIA_MS).toISOString();
  await supabase
    .from("mercadolibre_full_recepciones")
    .update({ atendido_en: new Date().toISOString(), decision: "SALIDA" })
    .is("atendido_en", null)
    .in("inventory_id", inventarios)
    .gte("detectado_en", desde);
}

// ---------------------------------------------------------------------------
// Generar las salidas de bodega de las líneas
// ---------------------------------------------------------------------------

/** Genera la salida de bodega de cada línea que todavía no la tiene y ya
 * resuelve a un producto del CRM. Cantidad = declaradas × piezas por unidad
 * mientras el envío está abierto; si ya se cerró, lo recibido × factor (y
 * la merma aparte, si así se decidió). Las que no resuelven quedan
 * pendientes ("sin ligar") y se generan solas al ligarlas. */
async function generarSalidasLineas(envio: EnvioFullMl, lineas: EnvioFullMlLinea[], bodegaId: string): Promise<{ generadas: number; sinLigar: number; error: string | null }> {
  const pendientes = lineas.filter((l) => !l.salida_generada_en);
  if (!pendientes.length) return { generadas: 0, sinLigar: 0, error: null };
  const supabase = createServiceClient();
  const resolvedor = await resolvedorSku();
  const cerrado = Boolean(envio.cerrado_en);
  const planes: { linea: EnvioFullMlLinea; sku: string; full: number; merma: number; factor: number; declaradas: number }[] = [];
  let sinLigar = 0;
  for (const l of pendientes) {
    const sku = resolvedor.skuDe(l.item_id, l.variation_id, l.seller_sku);
    if (!sku) {
      sinLigar++;
      continue;
    }
    const factor = resolvedor.factorDe(l.item_id, l.variation_id, l.seller_sku);
    const declaradas = l.cantidad_planeada ?? l.cantidad_recibida;
    const full = Math.round((cerrado ? l.cantidad_recibida : declaradas) * factor);
    const diff = cerrado ? declaradas - l.cantidad_recibida : 0;
    const merma = cerrado && l.diferencia_decision === "MERMA" && diff > 0 ? Math.round(diff * factor) : 0;
    planes.push({ linea: l, sku, full, merma, factor, declaradas });
  }
  if (!planes.length) return { generadas: 0, sinLigar, error: null };

  const fichas = await fichasPorSku(Array.from(new Set(planes.map((p) => p.sku))));
  const ahora = new Date().toISOString();
  const salioEn = envio.salio_en ?? envio.fecha_recepcion ?? envio.confirmado_en ?? ahora;
  let generadas = 0;
  for (const p of planes) {
    const ficha = fichas.get(p.sku);
    const base = {
      sku: p.sku,
      nombre: ficha?.nombre ?? p.linea.titulo ?? p.sku,
      bodega_id: bodegaId,
      piezas_por_caja: ficha?.piezas_por_caja ?? 1,
      imagen_url: ficha?.imagen_url ?? p.linea.imagen_url ?? null,
      costo_unitario_pesos: 0,
      inbound_ml_id: envio.inbound_id,
    };
    const filas: Record<string, unknown>[] = [];
    if (p.full > 0) {
      filas.push({
        ...base,
        tipo: "SALIDA",
        cantidad: p.full,
        destino: "Full",
        referencia: `Envío a Full ${envio.inbound_id}${p.factor > 1 ? ` · ${p.declaradas} × ${p.factor} pzas` : ""}`,
        creado_en: salioEn,
      });
    }
    if (p.merma > 0) {
      filas.push({
        ...base,
        tipo: "SALIDA",
        cantidad: p.merma,
        destino: "Merma",
        referencia: `Envío a Full ${envio.inbound_id}: ${p.merma} pzas no llegaron (merma)`,
        creado_en: envio.fecha_recepcion ?? ahora,
      });
    }
    let salidaId: string | null = null;
    if (filas.length) {
      const { data, error } = await insertarMovimientosStock(supabase, filas);
      if (error) return { generadas, sinLigar, error: `No se pudo registrar la salida de ${p.sku}: ${error}` };
      salidaId = p.full > 0 ? (data?.[0]?.id ?? null) : null;
    }
    const { error: errorLinea } = await supabase.from("mercadolibre_envios_full_lineas").update({ salida_movimiento_id: salidaId, salida_generada_en: ahora }).eq("id", p.linea.id);
    if (errorLinea) return { generadas, sinLigar, error: mensajeSql(errorLinea) };
    generadas++;
  }
  return { generadas, sinLigar, error: null };
}

// ---------------------------------------------------------------------------
// Momento 1: sale de la bodega
// ---------------------------------------------------------------------------

/** Registra la salida de bodega del envío (`confirmado_en`) y genera las
 * salidas de todas sus líneas ligadas. */
export async function descontarEnvioFullMl(inboundId: string, opciones: { fechaSalida?: string | null; bodegaId?: string | null } = {}) {
  const supabase = createServiceClient();
  const cargado = await cargarEnvio(inboundId);
  if (!cargado) return { error: "No se encontró ese envío.", generadas: 0, sinLigar: 0 };
  const { envio, lineas } = cargado;
  if (envio.confirmado_en) return { error: "Ese envío ya está registrado como salido de bodega.", generadas: 0, sinLigar: 0 };
  const bodega = opciones.bodegaId ? { id: opciones.bodegaId } : await bodegaPrincipal();
  if (!bodega) return { error: "No hay ninguna bodega dada de alta.", generadas: 0, sinLigar: 0 };
  const ahora = new Date().toISOString();
  const salioEn = envio.salio_en ?? instanteSalida(opciones.fechaSalida);
  const { error } = await supabase
    .from("mercadolibre_envios_full")
    .update({ confirmado_en: ahora, salio_en: salioEn, ignorado_en: null, fecha_creacion: envio.fecha_creacion ?? salioEn, actualizado_en: ahora })
    .eq("inbound_id", inboundId);
  if (error) return { error: mensajeSql(error), generadas: 0, sinLigar: 0 };
  const r = await generarSalidasLineas({ ...envio, confirmado_en: ahora, salio_en: salioEn }, lineas, bodega.id);
  await atenderRecepcionesDeEnvio(lineas, salioEn);
  return r;
}

export interface ResultadoCaptura {
  error: string | null;
  productos: number;
  /** Piezas declaradas (unidades de ML). */
  piezas: number;
  /** Códigos ML que no están en las publicaciones sincronizadas. */
  sinPublicacion: string[];
  /** Líneas que no resuelven a un producto del CRM (su salida queda pendiente). */
  sinLigar: number;
  /** Productos con diferencia entre declaradas y aptas (solo si ya llegó). */
  diferencias: number;
  cerrado: boolean;
}

const SIN_RESULTADO: Omit<ResultadoCaptura, "error"> = { productos: 0, piezas: 0, sinPublicacion: [], sinLigar: 0, diferencias: 0, cerrado: false };

/** Captura un envío pegando la tabla del panel de ML. `EN_CAMINO` = acaba
 * de salir: se descuenta la bodega con las declaradas. `LLEGO` = ya lo
 * recibió ML: se descuenta con las declaradas Y se registra la llegada con
 * las aptas (si no hay diferencias, queda cerrado de una vez). Si el envío
 * ya estaba en camino y se pega otra vez como `LLEGO`, es la llegada. */
export async function capturarEnvioDesdePanel(numero: string, texto: string, opciones: { momento: MomentoEnvio; fechaSalida?: string | null; bodegaId?: string | null }): Promise<ResultadoCaptura> {
  const supabase = createServiceClient();
  const inboundId = limpiarNumero(numero);
  if (!inboundId) return { ...SIN_RESULTADO, error: "Escribe el número del envío tal como sale en tu panel (ej. 77396369)." };
  const lineasPanel = parsearPanelEnvioMl(texto);
  if (!lineasPanel.length) {
    return { ...SIN_RESULTADO, error: "No encontré productos en lo que pegaste. Copia la tabla del envío en Mercado Libre (desde \"Código ML:\" hasta los totales) y vuelve a pegarla." };
  }

  const existente = await cargarEnvio(inboundId);
  if (existente?.envio.confirmado_en) {
    if (opciones.momento === "LLEGO" && !existente.envio.cerrado_en) {
      const r = await registrarLlegadaDesdePanel(inboundId, texto);
      return { ...SIN_RESULTADO, error: r.error, productos: lineasPanel.length, piezas: lineasPanel.reduce((s, l) => s + l.declaradas, 0), sinPublicacion: r.sinPublicacion, diferencias: r.diferencias, cerrado: r.cerrado };
    }
    return { ...SIN_RESULTADO, error: `El envío ${inboundId} ya está registrado (ya se descontó de tu bodega). Si quieres cambiarlo, dale "deshacer" abajo y vuelve a capturarlo.` };
  }

  const porInventario = await publicacionesPorInventario();
  const ahora = new Date().toISOString();
  const salioEn = instanteSalida(opciones.fechaSalida);
  const llego = opciones.momento === "LLEGO";
  const sinPublicacion: string[] = [];
  const lineas = lineasPanel.map((l) => {
    const pub = porInventario.get(l.inventoryId);
    if (!pub) sinPublicacion.push(`${l.inventoryId} (${l.titulo})`);
    return {
      inbound_id: inboundId,
      operacion_id: `manual:${inboundId}:${l.inventoryId}`,
      inventory_id: l.inventoryId,
      item_id: pub?.item_id ?? null,
      variation_id: pub?.variation_id ?? null,
      titulo: pub ? [pub.titulo, pub.variacion].filter(Boolean).join(" · ") : l.titulo,
      seller_sku: pub?.seller_sku ?? null,
      imagen_url: pub?.imagen_url ?? null,
      cantidad_planeada: l.declaradas,
      cantidad_recibida: llego ? l.recibidas : 0,
      fecha: salioEn,
      crudo: { origen: "pegado del panel de ML", momento: opciones.momento, declaradas: l.declaradas, aptas: llego ? l.recibidas : null, tituloPanel: l.titulo },
    };
  });
  const declaradas = lineas.reduce((s, l) => s + (l.cantidad_planeada ?? 0), 0);
  const fila = {
    inbound_id: inboundId,
    estado: llego ? "RECIBIDO" : "COLECTADO",
    estado_ml: llego ? "recibido (capturado del panel de ML, columna Aptas para Full)" : "en camino (capturado del panel de ML)",
    fecha_creacion: salioEn,
    fecha_recepcion: llego ? ahora : null,
    salio_en: salioEn,
    piezas_planeadas: declaradas,
    piezas_recibidas: llego ? lineas.reduce((s, l) => s + l.cantidad_recibida, 0) : 0,
    origen: "manual",
    crudo: { numero: inboundId, nota: "Capturado pegando la tabla del panel de ML. Declaradas = lo que salió de bodega; Aptas para Full = lo que ML recibió." },
    confirmado_en: null,
    ignorado_en: null,
    cerrado_en: null,
    actualizado_en: ahora,
  };
  const { error: errorEnvio } = await supabase.from("mercadolibre_envios_full").upsert(fila, { onConflict: "inbound_id" });
  if (errorEnvio) return { ...SIN_RESULTADO, error: `No se pudo guardar el envío: ${mensajeSql(errorEnvio)}`, sinPublicacion };
  await supabase.from("mercadolibre_envios_full_lineas").delete().eq("inbound_id", inboundId);
  const { error: errorLineas } = await supabase.from("mercadolibre_envios_full_lineas").insert(lineas);
  if (errorLineas) return { ...SIN_RESULTADO, error: `No se pudieron guardar los productos: ${errorLineas.message}`, sinPublicacion };

  const salida = await descontarEnvioFullMl(inboundId, { bodegaId: opciones.bodegaId });
  if (salida.error) return { ...SIN_RESULTADO, error: salida.error, productos: lineas.length, piezas: declaradas, sinPublicacion };

  let diferencias = 0;
  let cerrado = false;
  if (llego) {
    const r = await cerrarSiNoHayDiferencias(inboundId);
    diferencias = r.diferencias;
    cerrado = r.cerrado;
    if (r.error) return { ...SIN_RESULTADO, error: r.error, productos: lineas.length, piezas: declaradas, sinPublicacion, sinLigar: salida.sinLigar, diferencias };
  }
  return { error: null, productos: lineas.length, piezas: declaradas, sinPublicacion, sinLigar: salida.sinLigar, diferencias, cerrado };
}

// ---------------------------------------------------------------------------
// Momento 2: llega a Full
// ---------------------------------------------------------------------------

/** Si ninguna línea tiene diferencia, cierra el envío de una vez; si las hay, queda por resolver. */
export async function cerrarSiNoHayDiferencias(inboundId: string): Promise<{ error: string | null; diferencias: number; cerrado: boolean }> {
  const cargado = await cargarEnvio(inboundId);
  if (!cargado) return { error: "No se encontró ese envío.", diferencias: 0, cerrado: false };
  const diferencias = cargado.lineas.filter((l) => diferenciaLinea(l) !== 0).length;
  if (diferencias > 0) return { error: null, diferencias, cerrado: false };
  const r = await cerrarEnvioFullMl(inboundId, []);
  return { error: r.error, diferencias: 0, cerrado: !r.error };
}

/** "ML lo recibió completo": lo recibido = lo declarado, y se cierra. */
export async function registrarLlegadaCompleta(inboundId: string) {
  const supabase = createServiceClient();
  const cargado = await cargarEnvio(inboundId);
  if (!cargado) return { error: "No se encontró ese envío." };
  const { envio, lineas } = cargado;
  if (!envio.confirmado_en) return { error: "Primero registra la salida de bodega de este envío." };
  if (envio.cerrado_en) return { error: "Ese envío ya está cerrado." };
  const ahora = new Date().toISOString();
  for (const l of lineas) {
    if (l.cantidad_planeada === null || l.cantidad_planeada === l.cantidad_recibida) continue;
    const { error } = await supabase.from("mercadolibre_envios_full_lineas").update({ cantidad_recibida: l.cantidad_planeada }).eq("id", l.id);
    if (error) return { error: error.message };
  }
  const { error } = await supabase
    .from("mercadolibre_envios_full")
    .update({ estado: envio.estado === "CONTADO" ? "CONTADO" : "RECIBIDO", estado_ml: "recibido completo (confirmado por Isaac)", fecha_recepcion: envio.fecha_recepcion ?? ahora, piezas_recibidas: envio.piezas_planeadas ?? envio.piezas_recibidas, actualizado_en: ahora })
    .eq("inbound_id", inboundId);
  if (error) return { error: mensajeSql(error) };
  return cerrarEnvioFullMl(inboundId, []);
}

/** ML recibió con diferencias: se pega la tabla ya con "Aptas para Full".
 * Actualiza lo recibido de cada producto (por Código ML); si al final no
 * hay diferencias, cierra solo; si las hay, quedan por decidir. */
export async function registrarLlegadaDesdePanel(inboundId: string, texto: string): Promise<{ error: string | null; diferencias: number; cerrado: boolean; sinPublicacion: string[] }> {
  const supabase = createServiceClient();
  const cargado = await cargarEnvio(inboundId);
  if (!cargado) return { error: "No se encontró ese envío.", diferencias: 0, cerrado: false, sinPublicacion: [] };
  const { envio, lineas } = cargado;
  if (!envio.confirmado_en) return { error: "Primero registra la salida de bodega de este envío.", diferencias: 0, cerrado: false, sinPublicacion: [] };
  if (envio.cerrado_en) return { error: "Ese envío ya está cerrado. Si quieres corregirlo, dale \"deshacer\" y vuelve a capturarlo.", diferencias: 0, cerrado: false, sinPublicacion: [] };
  const lineasPanel = parsearPanelEnvioMl(texto);
  if (!lineasPanel.length) return { error: "No encontré productos en lo que pegaste. Copia la tabla del envío (desde \"Código ML:\" hasta los totales).", diferencias: 0, cerrado: false, sinPublicacion: [] };

  const porInventario = await publicacionesPorInventario();
  const porInv = new Map(lineas.filter((l) => l.inventory_id).map((l) => [l.inventory_id as string, l]));
  const sinPublicacion: string[] = [];
  const ahora = new Date().toISOString();
  for (const p of lineasPanel) {
    const l = porInv.get(p.inventoryId);
    if (l) {
      const { error } = await supabase
        .from("mercadolibre_envios_full_lineas")
        .update({ cantidad_recibida: p.recibidas, cantidad_planeada: l.cantidad_planeada ?? p.declaradas, crudo: { ...(l.crudo ?? {}), aptas: p.recibidas, declaradasPanel: p.declaradas, llegadaRegistrada: ahora } })
        .eq("id", l.id);
      if (error) return { error: error.message, diferencias: 0, cerrado: false, sinPublicacion };
    } else {
      // Un producto que no estaba al capturar la salida: se agrega (su salida se genera abajo).
      const pub = porInventario.get(p.inventoryId);
      if (!pub) sinPublicacion.push(`${p.inventoryId} (${p.titulo})`);
      const { error } = await supabase.from("mercadolibre_envios_full_lineas").insert({
        inbound_id: inboundId,
        operacion_id: `manual:${inboundId}:${p.inventoryId}`,
        inventory_id: p.inventoryId,
        item_id: pub?.item_id ?? null,
        variation_id: pub?.variation_id ?? null,
        titulo: pub ? [pub.titulo, pub.variacion].filter(Boolean).join(" · ") : p.titulo,
        seller_sku: pub?.seller_sku ?? null,
        imagen_url: pub?.imagen_url ?? null,
        cantidad_planeada: p.declaradas,
        cantidad_recibida: p.recibidas,
        fecha: envio.salio_en ?? ahora,
        crudo: { origen: "pegado del panel de ML al registrar la llegada", declaradas: p.declaradas, aptas: p.recibidas, tituloPanel: p.titulo },
      });
      if (error) return { error: error.message, diferencias: 0, cerrado: false, sinPublicacion };
    }
  }
  const actualizado = await cargarEnvio(inboundId);
  const lineasNuevas = actualizado?.lineas ?? [];
  const { error: errorEnvio } = await supabase
    .from("mercadolibre_envios_full")
    .update({
      estado: envio.estado === "CONTADO" ? "CONTADO" : "RECIBIDO",
      estado_ml: "recibido (tabla del panel de ML con Aptas para Full)",
      fecha_recepcion: envio.fecha_recepcion ?? ahora,
      piezas_planeadas: lineasNuevas.reduce((s, l) => s + (l.cantidad_planeada ?? 0), 0),
      piezas_recibidas: lineasNuevas.reduce((s, l) => s + l.cantidad_recibida, 0),
      actualizado_en: ahora,
    })
    .eq("inbound_id", inboundId);
  if (errorEnvio) return { error: mensajeSql(errorEnvio), diferencias: 0, cerrado: false, sinPublicacion };

  // Las líneas nuevas (si las hubo) también salen de bodega.
  const { data: movs } = await supabase.from("movimientos_stock").select("bodega_id").eq("inbound_ml_id", inboundId).limit(1).returns<{ bodega_id: string | null }[]>();
  const bodegaId = movs?.[0]?.bodega_id ?? (await bodegaPrincipal())?.id ?? null;
  if (bodegaId) {
    const r = await generarSalidasLineas({ ...envio, estado: "RECIBIDO" }, lineasNuevas, bodegaId);
    if (r.error) return { error: r.error, diferencias: 0, cerrado: false, sinPublicacion };
  }
  const cierre = await cerrarSiNoHayDiferencias(inboundId);
  return { error: cierre.error, diferencias: cierre.diferencias, cerrado: cierre.cerrado, sinPublicacion };
}

/** Cierra el envío: aplica la decisión de cada diferencia (se quedó en
 * bodega → la salida baja a lo recibido; merma → la salida baja y se
 * registra una salida destino "Merma") y lo deja `cerrado_en`. */
export async function cerrarEnvioFullMl(inboundId: string, decisiones: { lineaId: string; decision: DecisionDiferencia }[]): Promise<{ error: string | null; regresaron: number; mermas: number }> {
  const supabase = createServiceClient();
  const cargado = await cargarEnvio(inboundId);
  if (!cargado) return { error: "No se encontró ese envío.", regresaron: 0, mermas: 0 };
  const { envio, lineas } = cargado;
  if (!envio.confirmado_en) return { error: "Primero registra la salida de bodega de este envío.", regresaron: 0, mermas: 0 };
  if (envio.cerrado_en) return { error: "Ese envío ya está cerrado.", regresaron: 0, mermas: 0 };
  const decisionPor = new Map(decisiones.map((d) => [d.lineaId, d.decision]));
  const resolvedor = await resolvedorSku();
  const ahora = new Date().toISOString();
  let regresaron = 0;
  let mermas = 0;

  const conDiferencia = lineas.filter((l) => diferenciaLinea(l) !== 0);
  const skus = Array.from(new Set(conDiferencia.map((l) => resolvedor.skuDe(l.item_id, l.variation_id, l.seller_sku)).filter((x): x is string => Boolean(x))));
  const fichas = await fichasPorSku(skus);
  const { data: movs } = await supabase.from("movimientos_stock").select("bodega_id").eq("inbound_ml_id", inboundId).limit(1).returns<{ bodega_id: string | null }[]>();
  const bodegaId = movs?.[0]?.bodega_id ?? (await bodegaPrincipal())?.id ?? null;

  for (const l of conDiferencia) {
    const diff = diferenciaLinea(l);
    // Negativo = ML recibió MÁS de lo declarado: salieron más piezas, no hay merma.
    const decision: DecisionDiferencia = diff > 0 ? (decisionPor.get(l.id) ?? "QUEDO_EN_BODEGA") : "QUEDO_EN_BODEGA";
    const sku = resolvedor.skuDe(l.item_id, l.variation_id, l.seller_sku);
    const factor = resolvedor.factorDe(l.item_id, l.variation_id, l.seller_sku);
    if (l.salida_generada_en && sku && bodegaId) {
      const nuevaFull = Math.round(l.cantidad_recibida * factor);
      const ficha = fichas.get(sku);
      let salidaId = l.salida_movimiento_id ?? null;
      if (salidaId) {
        if (nuevaFull > 0) {
          const { error } = await supabase.from("movimientos_stock").update({ cantidad: nuevaFull }).eq("id", salidaId);
          if (error) return { error: error.message, regresaron, mermas };
        } else {
          const { error } = await supabase.from("movimientos_stock").delete().eq("id", salidaId);
          if (error) return { error: error.message, regresaron, mermas };
          salidaId = null;
        }
      } else if (nuevaFull > 0) {
        const { data, error } = await insertarMovimientosStock(supabase, [
          {
            tipo: "SALIDA",
            sku,
            nombre: ficha?.nombre ?? l.titulo ?? sku,
            bodega_id: bodegaId,
            cantidad: nuevaFull,
            piezas_por_caja: ficha?.piezas_por_caja ?? 1,
            imagen_url: ficha?.imagen_url ?? l.imagen_url ?? null,
            costo_unitario_pesos: 0,
            destino: "Full",
            referencia: `Envío a Full ${inboundId}`,
            inbound_ml_id: inboundId,
            creado_en: envio.salio_en ?? ahora,
          },
        ]);
        if (error) return { error, regresaron, mermas };
        salidaId = data?.[0]?.id ?? null;
      }
      if (diff > 0) {
        const piezasDiff = Math.round(diff * factor);
        if (decision === "MERMA") {
          const { error } = await insertarMovimientosStock(supabase, [
            {
              tipo: "SALIDA",
              sku,
              nombre: ficha?.nombre ?? l.titulo ?? sku,
              bodega_id: bodegaId,
              cantidad: piezasDiff,
              piezas_por_caja: ficha?.piezas_por_caja ?? 1,
              imagen_url: ficha?.imagen_url ?? l.imagen_url ?? null,
              costo_unitario_pesos: 0,
              destino: "Merma",
              referencia: `Envío a Full ${inboundId}: ${piezasDiff} pzas no llegaron (merma)`,
              inbound_ml_id: inboundId,
              creado_en: envio.fecha_recepcion ?? ahora,
            },
          ]);
          if (error) return { error, regresaron, mermas };
          mermas += piezasDiff;
        } else {
          regresaron += piezasDiff;
        }
      }
      const { error: errorLinea } = await supabase.from("mercadolibre_envios_full_lineas").update({ salida_movimiento_id: salidaId, diferencia_decision: diff > 0 ? decision : null }).eq("id", l.id);
      if (errorLinea) return { error: mensajeSql(errorLinea), regresaron, mermas };
    } else {
      // Sin ligar todavía: la decisión se guarda y se aplica al generar su salida.
      const { error: errorLinea } = await supabase.from("mercadolibre_envios_full_lineas").update({ diferencia_decision: diff > 0 ? decision : null }).eq("id", l.id);
      if (errorLinea) return { error: mensajeSql(errorLinea), regresaron, mermas };
    }
  }

  const { error } = await supabase
    .from("mercadolibre_envios_full")
    .update({
      cerrado_en: ahora,
      estado: envio.estado === "CONTADO" ? "CONTADO" : "RECIBIDO",
      fecha_recepcion: envio.fecha_recepcion ?? ahora,
      piezas_recibidas: lineas.reduce((s, l) => s + l.cantidad_recibida, 0),
      actualizado_en: ahora,
    })
    .eq("inbound_id", inboundId);
  if (error) return { error: mensajeSql(error), regresaron, mermas };
  await atenderRecepcionesDeEnvio(lineas, envio.salio_en ?? envio.confirmado_en);
  return { error: null, regresaron, mermas };
}

// ---------------------------------------------------------------------------
// Pendientes, deshacer, lecturas
// ---------------------------------------------------------------------------

/** Reloj y pantalla: genera las salidas de las líneas que no la tenían
 * (estaban sin ligar) y ya resuelven a un producto del CRM. */
export async function generarSalidasPendientesEnvios(): Promise<{ generadas: number; sinLigar: number }> {
  const supabase = createServiceClient();
  const { data: lineas, error } = await supabase.from("mercadolibre_envios_full_lineas").select("*").is("salida_generada_en", null).returns<EnvioFullMlLinea[]>();
  if (error || !lineas?.length) return { generadas: 0, sinLigar: 0 };
  const ids = Array.from(new Set(lineas.map((l) => l.inbound_id)));
  const { data: envios } = await supabase
    .from("mercadolibre_envios_full")
    .select("*")
    .in("inbound_id", ids)
    .not("confirmado_en", "is", null)
    .is("ignorado_en", null)
    .returns<EnvioFullMl[]>();
  if (!envios?.length) return { generadas: 0, sinLigar: 0 };
  const principal = await bodegaPrincipal();
  const { data: movs } = await supabase.from("movimientos_stock").select("inbound_ml_id, bodega_id").in("inbound_ml_id", envios.map((e) => e.inbound_id)).returns<{ inbound_ml_id: string; bodega_id: string | null }[]>();
  const bodegaPorEnvio = new Map<string, string>();
  for (const m of movs ?? []) if (m.bodega_id && !bodegaPorEnvio.has(m.inbound_ml_id)) bodegaPorEnvio.set(m.inbound_ml_id, m.bodega_id);
  let generadas = 0;
  let sinLigar = 0;
  for (const envio of envios) {
    const bodegaId = bodegaPorEnvio.get(envio.inbound_id) ?? principal?.id;
    if (!bodegaId) continue;
    const r = await generarSalidasLineas(envio, lineas.filter((l) => l.inbound_id === envio.inbound_id), bodegaId);
    generadas += r.generadas;
    sinLigar += r.sinLigar;
  }
  return { generadas, sinLigar };
}

/** Deshacer por completo: borra las salidas de bodega de ese envío (Full y
 * merma), sus productos y el envío. Queda como si no se hubiera capturado. */
export async function deshacerEnvioFullMl(inboundId: string) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("movimientos_stock").delete().eq("inbound_ml_id", inboundId);
  if (error) return { error: error.message };
  await supabase.from("mercadolibre_envios_full_lineas").delete().eq("inbound_id", inboundId);
  const { error: errorEnvio } = await supabase.from("mercadolibre_envios_full").delete().eq("inbound_id", inboundId);
  return { error: errorEnvio?.message ?? null };
}

/** Un envío que no se había descontado (capturado con el flujo anterior):
 * Isaac dice que NO salió de su bodega (ej. devolución a Full). */
export async function ignorarEnvioFullMl(inboundId: string) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("mercadolibre_envios_full").update({ ignorado_en: new Date().toISOString() }).eq("inbound_id", inboundId).is("confirmado_en", null);
  return { error: error?.message ?? null };
}

export async function obtenerEnviosFullMl(): Promise<{ envio: EnvioFullMl; lineas: EnvioFullMlLinea[] }[]> {
  const supabase = createServiceClient();
  const { data: envios, error } = await supabase.from("mercadolibre_envios_full").select("*").order("fecha_creacion", { ascending: false, nullsFirst: false }).limit(200).returns<EnvioFullMl[]>();
  if (error) throw new Error(error.message);
  if (!envios?.length) return [];
  const { data: lineas } = await supabase
    .from("mercadolibre_envios_full_lineas")
    .select("*")
    .in("inbound_id", envios.map((e) => e.inbound_id))
    .order("creado_en", { ascending: true })
    .returns<EnvioFullMlLinea[]>();
  return envios.map((envio) => ({ envio, lineas: (lineas ?? []).filter((l) => l.inbound_id === envio.inbound_id) }));
}

/** Piezas (del CRM) que ya salieron de bodega y todavía van en camino a
 * Full, por SKU, con su valor a costo promedio. Para la tarjeta de Stock. */
export async function enCaminoAFull(costoPorSku: Map<string, number>): Promise<{ porSku: Map<string, number>; piezas: number; valor: number; envios: number }> {
  const vacio = { porSku: new Map<string, number>(), piezas: 0, valor: 0, envios: 0 };
  const supabase = createServiceClient();
  const { data: envios } = await supabase
    .from("mercadolibre_envios_full")
    .select("inbound_id, estado, confirmado_en, cerrado_en, ignorado_en")
    .not("confirmado_en", "is", null)
    .is("cerrado_en", null)
    .is("ignorado_en", null)
    .returns<Pick<EnvioFullMl, "inbound_id" | "estado" | "confirmado_en" | "cerrado_en" | "ignorado_en">[]>();
  const enCamino = (envios ?? []).filter((e) => e.estado !== "RECIBIDO" && e.estado !== "CONTADO" && e.estado !== "CANCELADO");
  if (!enCamino.length) return vacio;
  const { data: movs } = await supabase
    .from("movimientos_stock")
    .select("sku, cantidad")
    .in("inbound_ml_id", enCamino.map((e) => e.inbound_id))
    .eq("tipo", "SALIDA")
    .eq("destino", "Full")
    .returns<{ sku: string; cantidad: number }[]>();
  const porSku = new Map<string, number>();
  for (const m of movs ?? []) porSku.set(m.sku, (porSku.get(m.sku) ?? 0) + m.cantidad);
  let piezas = 0;
  let valor = 0;
  for (const [sku, n] of porSku) {
    piezas += n;
    valor += n * (costoPorSku.get(sku) ?? 0);
  }
  return { porSku, piezas, valor, envios: enCamino.length };
}

/** Subidas de stock en Full detectadas (por diferencia de totales) en los
 * últimos 30 días que NINGÚN envío capturado explica: probablemente un
 * envío que se olvidó capturar, o una devolución que llegó a Full. */
export async function recepcionesSinExplicar(): Promise<RecepcionFull[]> {
  const supabase = createServiceClient();
  const desde = new Date(Date.now() - 30 * DIA_MS).toISOString();
  const { data: recepciones } = await supabase
    .from("mercadolibre_full_recepciones")
    .select("*")
    .is("atendido_en", null)
    .gte("detectado_en", desde)
    .order("detectado_en", { ascending: false })
    .returns<RecepcionFull[]>();
  if (!recepciones?.length) return [];
  const desdeEnvios = new Date(Date.now() - 45 * DIA_MS).toISOString();
  const { data: envios } = await supabase.from("mercadolibre_envios_full").select("inbound_id").gte("actualizado_en", desdeEnvios).returns<{ inbound_id: string }[]>();
  const explicados = new Set<string>();
  if (envios?.length) {
    const { data: lineas } = await supabase.from("mercadolibre_envios_full_lineas").select("inventory_id").in("inbound_id", envios.map((e) => e.inbound_id)).returns<{ inventory_id: string | null }[]>();
    for (const l of lineas ?? []) if (l.inventory_id) explicados.add(l.inventory_id);
  }
  return recepciones.filter((r) => !explicados.has(r.inventory_id));
}

export async function ignorarRecepcionFull(recepcionId: string) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("mercadolibre_full_recepciones").update({ atendido_en: new Date().toISOString(), decision: "IGNORADA" }).eq("id", recepcionId).is("atendido_en", null);
  return { error: error?.message ?? null };
}

/** Lo que ML ya subió en Full (piezas del CRM) de cada inventario de un
 * envío en camino, desde que salió: pista para cerrarlo. */
export function subidasDetectadas(recepciones: RecepcionFull[], envio: EnvioFullMl): Map<string, number> {
  const porInventario = new Map<string, number>();
  const desde = envio.salio_en ?? envio.confirmado_en;
  if (!desde) return porInventario;
  const limite = new Date(desde).getTime() - DIA_MS;
  for (const r of recepciones) {
    if (r.atendido_en || new Date(r.detectado_en).getTime() < limite) continue;
    porInventario.set(r.inventory_id, (porInventario.get(r.inventory_id) ?? 0) + Number(r.cantidad));
  }
  return porInventario;
}

/** Junta las líneas del mismo producto en un renglón por inventario/publicación. */
export interface LineaAgrupada {
  clave: string;
  lineaIds: string[];
  inventory_id: string | null;
  item_id: string | null;
  variation_id: number | null;
  titulo: string | null;
  seller_sku: string | null;
  imagen_url: string | null;
  planeadas: number | null;
  recibidas: number;
  /** Ya tiene su salida de bodega generada (o se intentó y resolvió). */
  salidaGenerada: boolean;
  decision: DecisionDiferencia | null;
}

export function agruparLineas(lineas: EnvioFullMlLinea[]): LineaAgrupada[] {
  const grupos = new Map<string, LineaAgrupada>();
  for (const l of lineas) {
    const clave = l.inventory_id ?? (l.item_id ? `${l.item_id}|${l.variation_id ?? 0}` : l.operacion_id);
    const g = grupos.get(clave) ?? {
      clave,
      lineaIds: [],
      inventory_id: l.inventory_id,
      item_id: l.item_id,
      variation_id: l.variation_id,
      titulo: l.titulo,
      seller_sku: l.seller_sku,
      imagen_url: l.imagen_url,
      planeadas: null,
      recibidas: 0,
      salidaGenerada: true,
      decision: null,
    };
    g.lineaIds.push(l.id);
    if (!g.titulo && l.titulo) g.titulo = l.titulo;
    if (!g.imagen_url && l.imagen_url) g.imagen_url = l.imagen_url;
    if (!g.item_id && l.item_id) g.item_id = l.item_id;
    if (!g.seller_sku && l.seller_sku) g.seller_sku = l.seller_sku;
    if (l.cantidad_planeada !== null) g.planeadas = (g.planeadas ?? 0) + l.cantidad_planeada;
    g.recibidas += l.cantidad_recibida;
    if (!l.salida_generada_en) g.salidaGenerada = false;
    if (l.diferencia_decision && !g.decision) g.decision = l.diferencia_decision;
    grupos.set(clave, g);
  }
  return Array.from(grupos.values());
}

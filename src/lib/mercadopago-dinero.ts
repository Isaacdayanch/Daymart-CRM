// Dinero real de Mercado Pago (3 nov 2026).
//
// Isaac: "que el CRM descargue solito el resumen… y tengamos el dato exacto de
// lo que entró, el flujo entrante". El CRM pide a Mercado Pago su "Reporte de
// liberaciones" (release report), lo descarga y guarda cada renglón tal cual
// (`mercadopago_movimientos`). Luego cruza cada cobro con su venta de ML
// (`mercadolibre_ordenes.pago_ids`) y le pone a la venta los montos EXACTOS
// (`mp_bruto`, `mp_comision`, `mp_envio`, `mp_impuestos`, `mp_neto`), que
// mandan sobre lo que el CRM calculaba (`mercadolibre-montos.ts`).
//
// El reporte se genera en Mercado Pago de forma asíncrona: se pide, tarda unos
// minutos, y en la siguiente vuelta (botón o reloj) ya está listo para bajar.
//
// Llave: MERCADOPAGO_ACCESS_TOKEN (Access Token de producción de la cuenta de
// Mercado Pago de la tienda; variable de entorno en Vercel, nunca en el repo).

import { createHash } from "node:crypto";
import { createServiceClient } from "./supabase/servicio";
import { todasLasFilas } from "./cargar-todo";

const API_MP = "https://api.mercadopago.com";
const DIA_MS = 86_400_000;
/** La primera vez se piden 90 días hacia atrás. */
const DIAS_PRIMERA_VEZ = 90;
/** Mercado Pago no acepta reportes de rangos muy largos: se piden por tramos. */
const DIAS_POR_REPORTE = 31;

export function mercadoPagoConfigurado() {
  return Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN);
}

/** "Falta el SQL 0063" se detecta por el mensaje de PostgREST. */
export function faltaSqlDinero(mensaje: string | undefined | null) {
  return Boolean(mensaje && /(mercadopago_|mp_neto|pago_ids)/.test(mensaje) && /(does not exist|schema cache|Could not find)/i.test(mensaje));
}

async function mp(ruta: string, opciones: { method?: string; body?: unknown; texto?: boolean } = {}) {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error("Falta la llave MERCADOPAGO_ACCESS_TOKEN en Vercel.");
  const r = await fetch(`${API_MP}${ruta}`, {
    method: opciones.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, ...(opciones.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const texto = await r.text().catch(() => "");
  if (!r.ok) {
    let detalle = texto.slice(0, 300);
    try {
      const j = JSON.parse(texto) as { message?: string; error?: string };
      detalle = j.message ?? j.error ?? detalle;
    } catch {
      // texto crudo
    }
    if (r.status === 401) detalle = `${detalle} (¿la llave MERCADOPAGO_ACCESS_TOKEN es la de producción y está completa?)`;
    const e = new Error(`Mercado Pago respondió ${r.status} en ${ruta}: ${detalle}`) as Error & { status?: number };
    e.status = r.status;
    throw e;
  }
  if (opciones.texto) return texto;
  try {
    return texto ? JSON.parse(texto) : null;
  } catch {
    return texto;
  }
}

// ---------------------------------------------------------------------------
// Configuración y solicitud del reporte

/** Columnas que se piden. Si Mercado Pago no acepta alguna, se reintenta con
 * las básicas. Los encabezados vienen en inglés (`report_translation: en`)
 * para leerlos sin adivinar el idioma. */
const COLUMNAS_COMPLETAS = [
  "DATE",
  "SOURCE_ID",
  "EXTERNAL_REFERENCE",
  "RECORD_TYPE",
  "DESCRIPTION",
  "NET_CREDIT_AMOUNT",
  "NET_DEBIT_AMOUNT",
  "GROSS_AMOUNT",
  "MP_FEE_AMOUNT",
  "FINANCING_FEE_AMOUNT",
  "SHIPPING_FEE_AMOUNT",
  "TAXES_AMOUNT",
  "COUPON_AMOUNT",
  "INSTALLMENTS",
  "PAYMENT_METHOD",
  "ORDER_ID",
  "PACK_ID",
  "SHIPPING_ID",
  "BALANCE_AMOUNT",
];
const COLUMNAS_BASICAS = ["DATE", "SOURCE_ID", "EXTERNAL_REFERENCE", "RECORD_TYPE", "DESCRIPTION", "NET_CREDIT_AMOUNT", "NET_DEBIT_AMOUNT", "GROSS_AMOUNT", "MP_FEE_AMOUNT", "FINANCING_FEE_AMOUNT", "SHIPPING_FEE_AMOUNT", "TAXES_AMOUNT", "COUPON_AMOUNT"];

function configuracion(columnas: string[]) {
  return {
    file_name_prefix: "daymart-liberaciones",
    columns: columnas.map((key) => ({ key })),
    display_timezone: "GMT-06",
    report_translation: "en",
    separator: ",",
    include_withdrawal_at_end: false,
    scheduled: false,
    frequency: { hour: 3, type: "daily", value: 1 },
  };
}

/** Deja dada de alta la configuración del reporte en Mercado Pago (una vez). */
async function asegurarConfiguracion() {
  const supabase = createServiceClient();
  const { data } = await supabase.from("mercadopago_sync").select("configurado_en").eq("id", 1).maybeSingle<{ configurado_en: string | null }>();
  if (data?.configurado_en) return;
  let existe = false;
  try {
    await mp("/v1/account/release_report/config");
    existe = true;
  } catch {
    existe = false;
  }
  const intentar = async (columnas: string[]) => mp("/v1/account/release_report/config", { method: existe ? "PUT" : "POST", body: configuracion(columnas) });
  try {
    await intentar(COLUMNAS_COMPLETAS);
  } catch {
    await intentar(COLUMNAS_BASICAS);
  }
  await supabase.from("mercadopago_sync").upsert({ id: 1, configurado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() });
}

interface ReporteMp {
  id?: number;
  file_name?: string;
  begin_date?: string;
  end_date?: string;
  status?: string;
  date_created?: string;
}

async function listaReportes(): Promise<ReporteMp[]> {
  const r = await mp("/v1/account/release_report/list");
  return Array.isArray(r) ? (r as ReporteMp[]) : [];
}

/** Pide a Mercado Pago un reporte nuevo de `desde` a `hasta` (se genera en
 * unos minutos). */
async function pedirReporte(desde: Date, hasta: Date) {
  await asegurarConfiguracion();
  await mp("/v1/account/release_report", { method: "POST", body: { begin_date: desde.toISOString().replace(/\.\d{3}Z$/, "Z"), end_date: hasta.toISOString().replace(/\.\d{3}Z$/, "Z") } });
  const supabase = createServiceClient();
  await supabase
    .from("mercadopago_sync")
    .upsert({ id: 1, ultima_solicitud: new Date().toISOString(), ultima_solicitud_desde: desde.toISOString(), ultima_solicitud_hasta: hasta.toISOString(), ultimo_error: null, actualizado_en: new Date().toISOString() });
}

// ---------------------------------------------------------------------------
// Lectura del CSV

/** Separa un CSV respetando comillas. Acepta coma o punto y coma. */
export function leerCsv(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, "");
  const primera = limpio.split(/\r?\n/, 1)[0] ?? "";
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ";" : ",";
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) {
      fila.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpio[i + 1] === "\n") i++;
      fila.push(campo);
      if (fila.some((x) => x.trim() !== "")) filas.push(fila);
      fila = [];
      campo = "";
    } else campo += c;
  }
  fila.push(campo);
  if (fila.some((x) => x.trim() !== "")) filas.push(fila);
  return filas;
}

/** Encabezado → clave estándar (por si viniera en español). */
const SINONIMOS: Record<string, string> = {
  FECHA: "DATE",
  FECHA_DE_LIBERACION: "DATE",
  ID_DE_OPERACION_EN_MERCADO_PAGO: "SOURCE_ID",
  ID_DE_LA_OPERACION: "SOURCE_ID",
  CODIGO_DE_REFERENCIA: "EXTERNAL_REFERENCE",
  TIPO_DE_REGISTRO: "RECORD_TYPE",
  DESCRIPCION: "DESCRIPTION",
  MONTO_NETO_ACREDITADO: "NET_CREDIT_AMOUNT",
  MONTO_NETO_DEBITADO: "NET_DEBIT_AMOUNT",
  VALOR_DE_LA_COMPRA: "GROSS_AMOUNT",
  MONTO_BRUTO: "GROSS_AMOUNT",
  COMISION_DE_MERCADO_PAGO_O_MERCADO_LIBRE: "MP_FEE_AMOUNT",
  TARIFA_DE_MERCADO_PAGO: "MP_FEE_AMOUNT",
  COSTO_DE_OFRECER_MESES_SIN_INTERESES: "FINANCING_FEE_AMOUNT",
  COSTO_DE_ENVIO: "SHIPPING_FEE_AMOUNT",
  IMPUESTOS: "TAXES_AMOUNT",
  CUPON_DE_DESCUENTO: "COUPON_AMOUNT",
  ID_DE_LA_ORDEN: "ORDER_ID",
  NUMERO_DE_VENTA: "ORDER_ID",
  ID_DEL_CARRITO: "PACK_ID",
  ID_DEL_ENVIO: "SHIPPING_ID",
};

function normalizarEncabezado(h: string) {
  const base = h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return SINONIMOS[base] ?? base;
}

/** "1,234.56", "-27.66", "$ 1.234,56" → número. Vacío → null. */
export function numeroMp(v: string | undefined): number | null {
  if (v == null) return null;
  let t = v.replace(/[$\s]/g, "");
  if (!t) return null;
  if (/,\d{1,2}$/.test(t) && !/\.\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function enteroMp(v: string | undefined): number | null {
  const t = (v ?? "").replace(/\D/g, "");
  return t ? Number(t) : null;
}

export interface RenglonMp {
  id: string;
  fecha: string | null;
  source_id: string | null;
  external_reference: string | null;
  orden_id: number | null;
  pack_id: number | null;
  envio_id: number | null;
  tipo: string | null;
  descripcion: string | null;
  bruto: number | null;
  comision: number | null;
  financiamiento: number | null;
  envio: number | null;
  impuestos: number | null;
  cupon: number | null;
  neto: number;
  crudo: Record<string, string>;
}

/** Fecha del reporte → ISO. Acepta "2026-10-20T13:45:10.000-06:00" o
 * "20/10/2026 13:45". */
function fechaMp(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(t);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T${(m[4] ?? "00").padStart(2, "0")}:${m[5] ?? "00"}:00-06:00`;
    return new Date(iso).toISOString();
  }
  return null;
}

/** Convierte el CSV del reporte en renglones. Los montos de comisión, envío,
 * impuestos y financiamiento se guardan en positivo (lo que se descontó);
 * `neto` = acreditado − debitado (lo que de verdad entró o salió). */
export function renglonesDeReporte(texto: string): { renglones: RenglonMp[]; columnas: string[] } {
  const filas = leerCsv(texto);
  if (!filas.length) return { renglones: [], columnas: [] };
  const columnas = filas[0].map(normalizarEncabezado);
  const renglones: RenglonMp[] = [];
  for (const f of filas.slice(1)) {
    const c: Record<string, string> = {};
    columnas.forEach((k, i) => (c[k] = (f[i] ?? "").trim()));
    // Los renglones de saldo (inicial/final/total) no son movimientos.
    const tipo = c.RECORD_TYPE || null;
    if (tipo && /initial|total|subtotal|available_balance/i.test(tipo)) continue;
    const credito = numeroMp(c.NET_CREDIT_AMOUNT) ?? 0;
    const debito = numeroMp(c.NET_DEBIT_AMOUNT) ?? 0;
    if (!c.SOURCE_ID && !credito && !debito) continue;
    const abs = (v: string | undefined) => {
      const n = numeroMp(v);
      return n == null ? null : Math.abs(n);
    };
    const neto = Math.round((credito - Math.abs(debito)) * 100) / 100;
    const huella = createHash("sha1")
      .update([c.DATE, c.SOURCE_ID, c.RECORD_TYPE, c.DESCRIPTION, c.NET_CREDIT_AMOUNT, c.NET_DEBIT_AMOUNT, c.GROSS_AMOUNT].join("|"))
      .digest("hex");
    renglones.push({
      id: huella,
      fecha: fechaMp(c.DATE),
      source_id: c.SOURCE_ID || null,
      external_reference: c.EXTERNAL_REFERENCE || null,
      orden_id: enteroMp(c.ORDER_ID),
      pack_id: enteroMp(c.PACK_ID),
      envio_id: enteroMp(c.SHIPPING_ID),
      tipo,
      descripcion: c.DESCRIPTION || null,
      bruto: numeroMp(c.GROSS_AMOUNT),
      comision: abs(c.MP_FEE_AMOUNT),
      financiamiento: abs(c.FINANCING_FEE_AMOUNT),
      envio: abs(c.SHIPPING_FEE_AMOUNT),
      impuestos: abs(c.TAXES_AMOUNT),
      cupon: abs(c.COUPON_AMOUNT),
      neto,
      crudo: c,
    });
  }
  return { renglones, columnas };
}

// ---------------------------------------------------------------------------
// Cruce con las ventas

interface OrdenCruce {
  id: number;
  total: number;
  pago_ids: number[] | null;
}

/** Montos exactos por cobro, sumando TODOS sus renglones (el pago y lo que
 * venga después: devoluciones, cargos de envío…). */
export function montosPorCobro(renglones: Pick<RenglonMp, "source_id" | "descripcion" | "bruto" | "comision" | "financiamiento" | "envio" | "impuestos" | "neto">[]) {
  const porCobro = new Map<string, { bruto: number; comision: number; envio: number; impuestos: number; neto: number }>();
  const devueltos = new Set<string>();
  for (const r of renglones) {
    if (!r.source_id) continue;
    const m = porCobro.get(r.source_id) ?? { bruto: 0, comision: 0, envio: 0, impuestos: 0, neto: 0 };
    // El bruto es el del cobro (renglón "payment"); un reembolso lo resta.
    const desc = (r.descripcion ?? "").toLowerCase();
    if (desc.includes("refund") || desc.includes("chargeback") || desc.includes("reembolso") || desc.includes("devol")) m.bruto -= Math.abs(r.bruto ?? 0);
    else if (desc === "" || desc.includes("payment") || desc.includes("pago")) m.bruto += r.bruto ?? 0;
    m.comision += (r.comision ?? 0) + (r.financiamiento ?? 0);
    m.envio += r.envio ?? 0;
    m.impuestos += r.impuestos ?? 0;
    m.neto += r.neto;
    if (desc.includes("refund") || desc.includes("chargeback") || desc.includes("reembolso") || desc.includes("devol")) devueltos.add(r.source_id);
    porCobro.set(r.source_id, m);
  }
  // En una devolución el renglón del reembolso no trae el desglose: lo que se
  // descontó de verdad es bruto − neto, y la comisión/envío/impuestos se
  // ajustan en proporción para que cuadren con eso (si ML regresó todo, 0).
  for (const id of devueltos) {
    const m = porCobro.get(id)!;
    const descontado = Math.max(0, m.bruto - m.neto);
    const suma = m.comision + m.envio + m.impuestos;
    if (suma > 0) {
      const f = Math.min(1, descontado / suma);
      m.comision *= f;
      m.envio *= f;
      m.impuestos *= f;
    }
  }
  return porCobro;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Pone los montos exactos a las ventas de los cobros indicados. Un cobro de
 * un carrito (varias ventas con el mismo cobro) se reparte en proporción a lo
 * que vale cada venta. Devuelve cuántas ventas quedaron con dato exacto. */
async function aplicarAVentas(sourceIds: string[]) {
  const supabase = createServiceClient();
  const ids = Array.from(new Set(sourceIds.filter((s) => /^\d+$/.test(s))));
  if (!ids.length) return 0;
  let actualizadas = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const tanda = ids.slice(i, i + 200);
    const [{ data: renglones, error: e1 }, { data: ordenes, error: e2 }] = await Promise.all([
      supabase.from("mercadopago_movimientos").select("source_id, orden_id, descripcion, bruto, comision, financiamiento, envio, impuestos, neto").in("source_id", tanda).returns<RenglonMp[]>(),
      supabase.from("mercadolibre_ordenes").select("id, total, pago_ids").overlaps("pago_ids", tanda.map(Number)).returns<OrdenCruce[]>(),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    const porCobro = montosPorCobro(renglones ?? []);
    // Ventas por cobro (para repartir carritos).
    const ventasDe = new Map<string, OrdenCruce[]>();
    for (const o of ordenes ?? []) for (const p of o.pago_ids ?? []) if (tanda.includes(String(p))) ventasDe.set(String(p), [...(ventasDe.get(String(p)) ?? []), o]);
    // Respaldo: si la venta no tenía guardado su cobro pero el reporte trae
    // el número de venta (ORDER_ID), se cruza por ahí.
    const sinVenta = new Map<string, number>();
    for (const r of renglones ?? []) if (r.source_id && r.orden_id && !ventasDe.has(r.source_id)) sinVenta.set(r.source_id, r.orden_id);
    if (sinVenta.size) {
      const { data: porOrden } = await supabase.from("mercadolibre_ordenes").select("id, total, pago_ids").in("id", Array.from(new Set(sinVenta.values()))).returns<OrdenCruce[]>();
      const porId = new Map((porOrden ?? []).map((o) => [Number(o.id), o]));
      for (const [cobro, ordenId] of sinVenta) {
        const o = porId.get(ordenId);
        if (o) ventasDe.set(cobro, [o]);
      }
    }
    const acumulado = new Map<number, { bruto: number; comision: number; envio: number; impuestos: number; neto: number }>();
    for (const [cobro, m] of porCobro) {
      const ventas = ventasDe.get(cobro) ?? [];
      const suma = ventas.reduce((s, v) => s + (Number(v.total) || 0), 0);
      for (const v of ventas) {
        const parte = suma > 0 ? (Number(v.total) || 0) / suma : 1 / ventas.length;
        const a = acumulado.get(v.id) ?? { bruto: 0, comision: 0, envio: 0, impuestos: 0, neto: 0 };
        a.bruto += m.bruto * parte;
        a.comision += m.comision * parte;
        a.envio += m.envio * parte;
        a.impuestos += m.impuestos * parte;
        a.neto += m.neto * parte;
        acumulado.set(v.id, a);
      }
    }
    for (const [id, a] of acumulado) {
      const { error } = await supabase
        .from("mercadolibre_ordenes")
        .update({ mp_bruto: r2(a.bruto), mp_comision: r2(a.comision), mp_envio: r2(a.envio), mp_impuestos: r2(a.impuestos), mp_neto: r2(a.neto), mp_actualizado_en: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
      actualizadas++;
    }
  }
  return actualizadas;
}

/** Guarda un reporte ya descargado y cruza sus cobros con las ventas. */
export async function importarReporte(archivo: string, texto: string, rango: { desde?: string | null; hasta?: string | null } = {}) {
  const supabase = createServiceClient();
  const { renglones, columnas } = renglonesDeReporte(texto);
  for (let i = 0; i < renglones.length; i += 500) {
    const tanda = renglones.slice(i, i + 500).map((r) => ({ ...r, reporte: archivo }));
    // Un mismo renglón puede venir dos veces en el mismo archivo: se deja uno.
    const unicos = Array.from(new Map(tanda.map((r) => [r.id, r])).values());
    const { error } = await supabase.from("mercadopago_movimientos").upsert(unicos);
    if (error) throw new Error(`No se pudo guardar el reporte de Mercado Pago: ${error.message}`);
  }
  const ventas = await aplicarAVentas(renglones.map((r) => r.source_id ?? ""));
  await supabase.from("mercadopago_reportes").upsert({ archivo, desde: rango.desde ?? null, hasta: rango.hasta ?? null, renglones: renglones.length, importado_en: new Date().toISOString() });
  await supabase.from("mercadopago_sync").upsert({ id: 1, ultima_importacion: new Date().toISOString(), columnas, ultimo_error: null, actualizado_en: new Date().toISOString() });
  return { renglones: renglones.length, ventas };
}

// ---------------------------------------------------------------------------
// El ciclo completo (botón y reloj)

export interface EstadoDineroMp {
  configurado_en: string | null;
  ultima_solicitud: string | null;
  ultima_solicitud_desde: string | null;
  ultima_solicitud_hasta: string | null;
  ultima_importacion: string | null;
  ultimo_error: string | null;
  columnas: string[] | null;
}

export async function obtenerEstadoDineroMp(): Promise<EstadoDineroMp | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("mercadopago_sync").select("*").eq("id", 1).maybeSingle<EstadoDineroMp>();
  if (error) throw new Error(error.message);
  return data;
}

/** 1) Baja e importa los reportes listos que falten. 2) Si hace falta, pide
 * uno nuevo hasta hoy (lo que no se ha cubierto). `forzar` pide aunque se haya
 * pedido hace poco (botón). Trabaja con presupuesto de tiempo. */
export async function sincronizarDineroMp(opciones: { forzar?: boolean; presupuestoMs?: number } = {}) {
  if (!mercadoPagoConfigurado()) return { sinLlave: true as const, importados: 0, renglones: 0, ventas: 0, pedido: false, pendiente: false };
  const inicio = Date.now();
  const presupuesto = opciones.presupuestoMs ?? 40_000;
  const supabase = createServiceClient();
  try {
    const [lista, { data: yaImportados, error }] = await Promise.all([
      listaReportes(),
      todasLasFilas<{ archivo: string; hasta: string | null }>((d, h) => supabase.from("mercadopago_reportes").select("archivo, hasta", { count: "exact" }).order("archivo").range(d, h)),
    ]);
    if (error) throw new Error(error.message);
    const importados = new Set((yaImportados ?? []).map((r) => r.archivo));
    let nImportados = 0;
    let renglones = 0;
    let ventas = 0;
    // Los listos que faltan, del más viejo al más nuevo.
    const listos = lista
      .filter((r) => r.file_name && !importados.has(r.file_name) && (!r.status || /processed|ready|done|finished/i.test(r.status)))
      .sort((a, b) => (a.end_date ?? "").localeCompare(b.end_date ?? ""));
    for (const r of listos) {
      if (Date.now() - inicio > presupuesto - 12_000) break;
      const texto = (await mp(`/v1/account/release_report/${encodeURIComponent(r.file_name!)}`, { texto: true })) as string;
      const res = await importarReporte(r.file_name!, texto, { desde: r.begin_date ?? null, hasta: r.end_date ?? null });
      nImportados++;
      renglones += res.renglones;
      ventas += res.ventas;
    }

    // ¿Hasta dónde está cubierto? Lo más nuevo entre lo importado y lo que
    // ya se pidió (para no pedir lo mismo dos veces).
    const estado = await obtenerEstadoDineroMp();
    const hastaCubierto = [...(yaImportados ?? []).map((r) => r.hasta), ...lista.map((r) => r.end_date ?? null)]
      .filter((x): x is string => Boolean(x))
      .map((x) => new Date(x).getTime())
      .filter((t) => Number.isFinite(t));
    const cubierto = hastaCubierto.length ? Math.max(...hastaCubierto) : null;
    const pendiente = Boolean(estado?.ultima_solicitud && (!cubierto || new Date(estado.ultima_solicitud_hasta ?? 0).getTime() > cubierto));
    const pedidoHace = estado?.ultima_solicitud ? Date.now() - new Date(estado.ultima_solicitud).getTime() : Infinity;
    let pedido = false;
    // Pide uno nuevo: con el botón (si no hay uno generándose) o, solo, una
    // vez cada 12 h.
    if ((opciones.forzar && !(pendiente && pedidoHace < 15 * 60_000)) || (!pendiente && pedidoHace > 12 * 3600_000)) {
      const ahora = new Date();
      let desde = cubierto ? new Date(cubierto - DIA_MS) : new Date(ahora.getTime() - DIAS_PRIMERA_VEZ * DIA_MS);
      // Tramos de máx. 31 días: se pide el más viejo que falte; los demás en
      // las siguientes vueltas.
      if (ahora.getTime() - desde.getTime() > DIAS_POR_REPORTE * DIA_MS) {
        const hasta = new Date(desde.getTime() + DIAS_POR_REPORTE * DIA_MS);
        await pedirReporte(desde, hasta);
      } else {
        if (ahora.getTime() - desde.getTime() < DIA_MS) desde = new Date(ahora.getTime() - DIA_MS);
        await pedirReporte(desde, ahora);
      }
      pedido = true;
    }
    return { sinLlave: false as const, importados: nImportados, renglones, ventas, pedido, pendiente: pedido || pendiente };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudo hablar con Mercado Pago.";
    await supabase.from("mercadopago_sync").upsert({ id: 1, ultimo_error: mensaje, actualizado_en: new Date().toISOString() });
    throw new Error(mensaje);
  }
}

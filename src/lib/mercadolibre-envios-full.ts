// Envíos a Full leídos directo de Mercado Libre (inbound). Isaac arma el
// envío en ML como siempre; el CRM lo trae con su estatus y sus productos,
// y cuando ML lo marca recibido, avisa para que Isaac confirme la salida
// de bodega con UN clic (nada se descuenta sin su confirmación).
//
// Nota: desde este entorno no se puede llamar a ML ni leer su
// documentación (egress bloqueado). Se intentan varios caminos de la API
// en orden y se guarda cuál funcionó (`mercadolibre_sync.endpoint_envios_full`);
// todo se lee a la defensiva y el dato crudo se conserva para diagnosticar
// con Isaac en la primera prueba real.

import { createServiceClient } from "@/lib/supabase/servicio";
import { mercadolibreGet, obtenerConexion } from "@/lib/mercadolibre-auth";
import { insertarMovimientosStock } from "@/lib/movimientos-stock";
import { obtenerPublicaciones, type PublicacionMl } from "@/lib/mercadolibre-stock";
import type { Bodega, EnvioFullLinea } from "@/lib/tipos";

const DIA_MS = 86400000;

/** Bitácora de la corrida: qué se le pidió a ML y qué contestó, para
 * diagnosticar con Isaac (se guarda en mercadolibre_sync.endpoint_envios_full). */
let intentos: string[] = [];
function anotar(ruta: string, resultado: string) {
  intentos.push(`${ruta.split("?")[0]} → ${resultado}`.slice(0, 300));
}
function mensajeError(e: unknown) {
  return (e instanceof Error ? e.message : String(e)).replace(/^Mercado Libre respondió /, "").slice(0, 200);
}
/** Fecha en el formato que ML suele pedir en Full: 2026-10-05T00:00:00.000-00:00 */
function fechaMl(d: Date) {
  return d.toISOString().replace("Z", "-00:00");
}

export type EstadoEnvioMl = "PLANEADO" | "COLECTADO" | "RECIBIDO" | "CONTADO" | "CANCELADO" | "DESCONOCIDO";

export const ETIQUETA_ESTADO_ENVIO_ML: Record<EstadoEnvioMl, string> = {
  PLANEADO: "Planeado",
  COLECTADO: "Colectado / en camino",
  RECIBIDO: "Recibido en Full",
  CONTADO: "Contado en Full",
  CANCELADO: "Cancelado",
  DESCONOCIDO: "Sin estatus",
};

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
  confirmado_en: string | null;
  ignorado_en: string | null;
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
  cantidad_planeada: number | null;
  cantidad_recibida: number;
  fecha: string | null;
  crudo: Record<string, unknown> | null;
}

type Crudo = Record<string, unknown>;

function numero(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
function textoDe(v: unknown): string | null {
  if (typeof v === "number") return String(v);
  return typeof v === "string" && v ? v : null;
}
function objeto(v: unknown): Crudo {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Crudo) : {};
}
function lista(v: unknown): Crudo[] {
  if (Array.isArray(v)) return v.filter((x) => x && typeof x === "object") as Crudo[];
  const o = objeto(v);
  for (const k of ["results", "inbounds", "items", "data", "elements"]) if (Array.isArray(o[k])) return o[k] as Crudo[];
  return [];
}
/** Busca la primera llave con valor entre varias candidatas (ML cambia nombres entre versiones). */
function primero(o: Crudo, llaves: string[]): unknown {
  for (const k of llaves) {
    const partes = k.split(".");
    let v: unknown = o;
    for (const p of partes) v = objeto(v)[p];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

/** Estado de ML → nuestro estado fijo. */
export function normalizarEstadoEnvio(estadoMl: string | null | undefined): EstadoEnvioMl {
  const e = (estadoMl ?? "").toLowerCase();
  if (!e) return "DESCONOCIDO";
  if (/cancel|rejected|expired/.test(e)) return "CANCELADO";
  if (/count|finish|closed|complet|process(ed)?$|stocked|available/.test(e)) return "CONTADO";
  if (/receiv|deliver|arriv|checked_in|check_in|unload/.test(e)) return "RECIBIDO";
  if (/collect|transit|shipped|picked|dispatch|on_the_way|handling/.test(e)) return "COLECTADO";
  if (/plan|pending|created|scheduled|draft|ready|confirm/.test(e)) return "PLANEADO";
  return "DESCONOCIDO";
}

// ---------------------------------------------------------------------------
// Lectura desde Mercado Libre (varios caminos, el primero que responda)
// ---------------------------------------------------------------------------

interface OperacionRecepcion {
  operacionId: string;
  inboundId: string;
  inventoryId: string | null;
  cantidad: number | null;
  fecha: string | null;
  crudo: Crudo;
}

/** Operaciones de stock de tipo recepción (inbound_reception) en Full:
 * cada una es "llegaron N piezas del inventario X por el envío Y". Primero
 * se intenta por vendedor; si ML exige inventario, se consulta inventario
 * por inventario (los de las publicaciones en Full). */
async function operacionesRecepcion(sellerId: number, desde: string, hasta: string, inventarios: string[]): Promise<{ operaciones: OperacionRecepcion[]; camino: string | null }> {
  const leerOperacion = (op: Crudo): OperacionRecepcion | null => {
    const tipo = textoDe(primero(op, ["type", "operation_type"]))?.toLowerCase() ?? "";
    if (tipo && !/inbound|reception|receiv/.test(tipo)) return null;
    const inboundId = textoDe(primero(op, ["detail.inbound_id", "detail.inbound.id", "inbound_id", "detail.external_reference", "detail.reference", "reference", "external_reference"]));
    if (!inboundId) return null;
    return {
      operacionId: textoDe(primero(op, ["id", "operation_id"])) ?? `${inboundId}:${textoDe(primero(op, ["inventory_id", "detail.inventory_id"])) ?? "?"}:${textoDe(primero(op, ["date_created", "date"])) ?? ""}`,
      inboundId,
      inventoryId: textoDe(primero(op, ["inventory_id", "detail.inventory_id", "result.inventory_id"])),
      cantidad: numero(primero(op, ["detail.quantity", "detail.received_quantity", "quantity", "result.quantity", "stock_values.quantity", "detail.units", "units"])),
      fecha: textoDe(primero(op, ["date_created", "date", "created_at"])),
      crudo: op,
    };
  };
  const paginar = async (ruta: (offset: number) => string) => {
    const operaciones: OperacionRecepcion[] = [];
    let crudas = 0;
    for (let offset = 0, vuelta = 0; vuelta < 40; vuelta++) {
      const r = await mercadolibreGet<unknown>(ruta(offset));
      const filas = lista(r);
      crudas += filas.length;
      for (const op of filas) {
        const leida = leerOperacion(op);
        if (leida) operaciones.push(leida);
      }
      const paging = objeto((r as Crudo)?.paging);
      const total = numero(paging.total) ?? filas.length;
      offset += 50;
      if (filas.length < 50 || offset >= total) break;
    }
    return { operaciones, crudas };
  };

  const base = `seller_id=${sellerId}&date_from=${encodeURIComponent(desde)}&date_to=${encodeURIComponent(hasta)}`;
  const caminos = [
    (offset: number) => `/stock/fulfillment/operations/search?${base}&type=inbound_reception&limit=50&offset=${offset}`,
    (offset: number) => `/stock/fulfillment/operations/search?${base}&limit=50&offset=${offset}`,
  ];
  for (const camino of caminos) {
    try {
      const { operaciones, crudas } = await paginar(camino);
      anotar(camino(0), `ok, ${crudas} operación(es), ${operaciones.length} de recepción con envío`);
      if (operaciones.length) return { operaciones, camino: camino(0).split("?")[0] };
    } catch (e) {
      anotar(camino(0), `error: ${mensajeError(e)}`);
    }
  }

  // Por inventario (las publicaciones en Full), en tandas de 8.
  if (inventarios.length) {
    const operaciones: OperacionRecepcion[] = [];
    let ok = 0;
    let errores = 0;
    let ultimoError = "";
    for (let i = 0; i < inventarios.length && i < 120; i += 8) {
      const tanda = inventarios.slice(i, i + 8);
      const resultados = await Promise.all(
        tanda.map(async (inv) => {
          try {
            const r = await paginar((offset) => `/stock/fulfillment/operations/search?${base}&inventory_id=${inv}&type=inbound_reception&limit=50&offset=${offset}`);
            ok++;
            return r.operaciones;
          } catch (e) {
            errores++;
            ultimoError = mensajeError(e);
            return [];
          }
        }),
      );
      for (const r of resultados) operaciones.push(...r);
      if (errores >= 8 && ok === 0) break;
    }
    anotar(`/stock/fulfillment/operations/search?inventory_id=…`, `${ok} inventario(s) ok, ${errores} con error${ultimoError ? ` (${ultimoError})` : ""}, ${operaciones.length} recepción(es)`);
    if (operaciones.length) return { operaciones, camino: "/stock/fulfillment/operations/search (por inventario)" };
  }
  return { operaciones: [], camino: null };
}

interface InboundLeido {
  inboundId: string;
  estadoMl: string | null;
  fechaCreacion: string | null;
  fechaRecepcion: string | null;
  lineas: { inventoryId: string | null; itemId: string | null; variationId: number | null; sellerSku: string | null; planeadas: number | null; recibidas: number | null; crudo: Crudo }[];
  crudo: Crudo;
}

function leerInbound(o: Crudo): InboundLeido | null {
  const inboundId = textoDe(primero(o, ["id", "inbound_id", "external_reference"]));
  if (!inboundId) return null;
  const items = lista(primero(o, ["items", "lines", "products", "details", "inbound_items"]));
  return {
    inboundId,
    estadoMl: textoDe(primero(o, ["status", "state", "status.id", "status.name"])),
    fechaCreacion: textoDe(primero(o, ["date_created", "created_at", "creation_date", "dates.created"])),
    fechaRecepcion: textoDe(primero(o, ["date_received", "received_date", "dates.received", "date_closed", "reception_date"])),
    lineas: items.map((i) => ({
      inventoryId: textoDe(primero(i, ["inventory_id", "inventory.id"])),
      itemId: textoDe(primero(i, ["item_id", "item.id", "id"])),
      variationId: numero(primero(i, ["variation_id", "item.variation_id"])),
      sellerSku: textoDe(primero(i, ["seller_sku", "sku", "seller_custom_field"])),
      planeadas: numero(primero(i, ["quantity", "planned_quantity", "declared_quantity", "units", "sent_quantity"])),
      recibidas: numero(primero(i, ["received_quantity", "quantity_received", "counted_quantity", "received"])),
      crudo: i,
    })),
    crudo: o,
  };
}

/** Lista de envíos (inbound) del vendedor: se intentan varios caminos. */
async function listarInbounds(sellerId: number): Promise<{ inbounds: InboundLeido[]; camino: string | null }> {
  const caminos = [
    `/fulfillment/inbound/search?seller_id=${sellerId}&limit=50`,
    `/fulfillment/inbounds/search?seller_id=${sellerId}&limit=50`,
    `/inbound/search?seller_id=${sellerId}&limit=50`,
    `/fulfillment/inbound?seller_id=${sellerId}&limit=50`,
    `/users/${sellerId}/fulfillment/inbounds?limit=50`,
    `/users/${sellerId}/inbounds/search?limit=50`,
    `/inbounds/search?seller_id=${sellerId}&limit=50`,
  ];
  for (const camino of caminos) {
    try {
      const r = await mercadolibreGet<unknown>(camino);
      const filas = lista(r);
      const inbounds = filas.map(leerInbound).filter((x): x is InboundLeido => x !== null);
      anotar(camino, `ok, ${filas.length} envío(s)${filas.length && !inbounds.length ? " pero sin id reconocible" : ""}`);
      if (inbounds.length) return { inbounds, camino: camino.split("?")[0] };
    } catch (e) {
      anotar(camino, `error: ${mensajeError(e)}`);
    }
  }
  return { inbounds: [], camino: null };
}

/** Detalle de un envío por id (para los que solo conocemos por sus recepciones). */
async function detalleInbound(sellerId: number, inboundId: string, caminoConocido: string | null): Promise<{ inbound: InboundLeido | null; camino: string | null }> {
  const caminos = [`/fulfillment/inbound/${inboundId}?seller_id=${sellerId}`, `/fulfillment/inbounds/${inboundId}`, `/inbound/${inboundId}`];
  const ordenados = caminoConocido ? [...caminos.filter((c) => c.startsWith(caminoConocido)), ...caminos.filter((c) => !c.startsWith(caminoConocido))] : caminos;
  for (const camino of ordenados) {
    try {
      const r = await mercadolibreGet<unknown>(camino);
      const inbound = leerInbound(objeto(r));
      anotar(camino.replace(inboundId, "{id}"), inbound ? "ok" : "ok pero sin id reconocible");
      if (inbound) return { inbound, camino: camino.replace(inboundId, "{id}").split("?")[0] };
    } catch (e) {
      anotar(camino.replace(inboundId, "{id}"), `error: ${mensajeError(e)}`);
    }
  }
  return { inbound: null, camino: null };
}

/** Prueba directa con un número de envío real del panel de ML (ej. 77396369):
 * se le pregunta a ML por ese envío por todos los caminos conocidos y se
 * regresa qué contestó cada uno (con un pedazo de la respuesta), para
 * descubrir el endpoint correcto con Isaac sin adivinar. */
export async function probarLecturaEnvio(inboundId: string): Promise<{ ruta: string; resultado: string; muestra?: string }[]> {
  const conexion = await obtenerConexion();
  if (!conexion) throw new Error("Mercado Libre no está conectado.");
  const id = inboundId.replace(/[^0-9A-Za-z_-]/g, "");
  const sellerId = conexion.ml_user_id;
  const rutas = [
    `/fulfillment/inbound/${id}?seller_id=${sellerId}`,
    `/fulfillment/inbound/${id}`,
    `/fulfillment/inbounds/${id}?seller_id=${sellerId}`,
    `/inbound/${id}?seller_id=${sellerId}`,
    `/inbound/${id}`,
    `/fulfillment/inbound/search?seller_id=${sellerId}&id=${id}`,
    `/fulfillment/inbound/search?seller_id=${sellerId}&inbound_id=${id}`,
    `/fulfillment/inbound/${id}/items?seller_id=${sellerId}`,
    `/stock/fulfillment/operations/search?seller_id=${sellerId}&type=inbound_reception&inbound_id=${id}`,
    `/shipments/${id}`,
  ];
  const resultados: { ruta: string; resultado: string; muestra?: string }[] = [];
  for (const ruta of rutas) {
    try {
      const r = await mercadolibreGet<unknown>(ruta);
      const texto = JSON.stringify(r);
      resultados.push({ ruta: ruta.replace(String(sellerId), "{seller}"), resultado: `ok (${texto.length} caracteres)`, muestra: texto.slice(0, 700) });
    } catch (e) {
      resultados.push({ ruta: ruta.replace(String(sellerId), "{seller}"), resultado: `error: ${mensajeError(e)}` });
    }
  }
  return resultados;
}

// ---------------------------------------------------------------------------
// Sincronización → copia local
// ---------------------------------------------------------------------------

/** Trae los envíos a Full de los últimos `diasAtras` días y los guarda.
 * Regresa cuántos envíos se vieron y si alguno pasó a "recibido" nuevo. */
export async function sincronizarEnviosFull(opciones: { diasAtras?: number } = {}) {
  const supabase = createServiceClient();
  const conexion = await obtenerConexion();
  if (!conexion) throw new Error("Mercado Libre no está conectado.");
  const diasAtras = opciones.diasAtras ?? 60;
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - diasAtras * DIA_MS);
  intentos = [];

  try {
    const publicaciones = await obtenerPublicaciones().catch(() => [] as PublicacionMl[]);
    const porInventario = new Map<string, PublicacionMl>();
    const porItem = new Map<string, PublicacionMl>();
    for (const p of publicaciones) {
      if (p.inventory_id && !porInventario.has(p.inventory_id)) porInventario.set(p.inventory_id, p);
      porItem.set(`${p.item_id}|${p.variation_id ?? 0}`, p);
    }
    const publicacionDe = (inventoryId: string | null, itemId: string | null, variationId: number | null) =>
      (inventoryId ? porInventario.get(inventoryId) : undefined) ?? (itemId ? porItem.get(`${itemId}|${variationId ?? 0}`) ?? porItem.get(`${itemId}|0`) : undefined) ?? null;

    const { data: existentes } = await supabase.from("mercadolibre_envios_full").select("inbound_id, estado, confirmado_en").returns<{ inbound_id: string; estado: EstadoEnvioMl; confirmado_en: string | null }[]>();
    const estadoPrevio = new Map((existentes ?? []).map((e) => [e.inbound_id, e.estado]));

    // 1) Lista de envíos (planeados, colectados, recibidos…)
    const { inbounds, camino: caminoLista } = await listarInbounds(conexion.ml_user_id);
    // 2) Recepciones reales de stock (lo que ML contó, por inventario)
    const inventariosFull = Array.from(new Set(publicaciones.filter((p) => p.inventory_id && p.logistica === "Full").map((p) => p.inventory_id as string)));
    const { operaciones, camino: caminoOps } = await operacionesRecepcion(conexion.ml_user_id, fechaMl(desde), fechaMl(hasta), inventariosFull);

    const inboundsPorId = new Map(inbounds.map((i) => [i.inboundId, i]));
    // Envíos que solo conocemos por sus recepciones: se intenta su detalle.
    let caminoDetalle: string | null = null;
    const faltantes = Array.from(new Set(operaciones.map((o) => o.inboundId))).filter((id) => !inboundsPorId.has(id));
    for (const id of faltantes.slice(0, 20)) {
      const { inbound, camino } = await detalleInbound(conexion.ml_user_id, id, caminoDetalle);
      if (inbound) {
        inboundsPorId.set(id, inbound);
        caminoDetalle = caminoDetalle ?? camino;
      }
    }

    const ahora = new Date().toISOString();
    const opsPorInbound = new Map<string, OperacionRecepcion[]>();
    for (const op of operaciones) opsPorInbound.set(op.inboundId, [...(opsPorInbound.get(op.inboundId) ?? []), op]);

    const ids = new Set<string>([...inboundsPorId.keys(), ...opsPorInbound.keys()]);
    let recibidosNuevos = 0;
    for (const inboundId of ids) {
      const inbound = inboundsPorId.get(inboundId) ?? null;
      const ops = opsPorInbound.get(inboundId) ?? [];
      const piezasRecibidasOps = ops.reduce((s, o) => s + (o.cantidad ?? 0), 0);
      const piezasRecibidasPlan = inbound?.lineas.reduce((s, l) => s + (l.recibidas ?? 0), 0) ?? 0;
      const piezasRecibidas = Math.max(piezasRecibidasOps, piezasRecibidasPlan);
      let estado = normalizarEstadoEnvio(inbound?.estadoMl);
      // Si ya hay recepciones de stock, el envío está al menos recibido.
      if (ops.length && (estado === "PLANEADO" || estado === "COLECTADO" || estado === "DESCONOCIDO")) estado = "RECIBIDO";
      const fechaRecepcion = inbound?.fechaRecepcion ?? ops.map((o) => o.fecha).filter(Boolean).sort().pop() ?? null;
      const fila = {
        inbound_id: inboundId,
        estado,
        estado_ml: inbound?.estadoMl ?? null,
        fecha_creacion: inbound?.fechaCreacion ?? ops.map((o) => o.fecha).filter(Boolean).sort()[0] ?? null,
        fecha_recepcion: fechaRecepcion,
        piezas_planeadas: inbound ? inbound.lineas.reduce((s, l) => s + (l.planeadas ?? 0), 0) || null : null,
        piezas_recibidas: piezasRecibidas,
        origen: inbound ? (ops.length ? "inbound+operaciones" : "inbound") : "operaciones",
        crudo: inbound?.crudo ?? (ops[0]?.crudo ?? null),
        actualizado_en: ahora,
      };
      const previo = estadoPrevio.get(inboundId);
      const esRecibido = estado === "RECIBIDO" || estado === "CONTADO";
      if (esRecibido && previo !== "RECIBIDO" && previo !== "CONTADO") recibidosNuevos++;
      const { error } = await supabase.from("mercadolibre_envios_full").upsert(fila, { onConflict: "inbound_id" });
      if (error) throw new Error(`No se pudo guardar el envío ${inboundId} (¿falta el SQL 0042?): ${error.message}`);

      // Líneas: del plan (una por inventario/item) y de las recepciones (una por operación).
      const lineas: Record<string, unknown>[] = [];
      for (const l of inbound?.lineas ?? []) {
        const pub = publicacionDe(l.inventoryId, l.itemId, l.variationId);
        lineas.push({
          inbound_id: inboundId,
          operacion_id: `plan:${inboundId}:${l.inventoryId ?? `${l.itemId ?? "?"}|${l.variationId ?? 0}`}`,
          inventory_id: l.inventoryId ?? pub?.inventory_id ?? null,
          item_id: l.itemId ?? pub?.item_id ?? null,
          variation_id: l.variationId ?? pub?.variation_id ?? null,
          titulo: pub?.titulo ?? textoDe(primero(l.crudo, ["title", "item.title", "name"])),
          seller_sku: l.sellerSku ?? pub?.seller_sku ?? null,
          imagen_url: pub?.imagen_url ?? null,
          cantidad_planeada: l.planeadas,
          cantidad_recibida: l.recibidas ?? 0,
          fecha: inbound?.fechaCreacion ?? null,
          crudo: l.crudo,
        });
      }
      for (const op of ops) {
        const pub = publicacionDe(op.inventoryId, null, null);
        lineas.push({
          inbound_id: inboundId,
          operacion_id: op.operacionId,
          inventory_id: op.inventoryId,
          item_id: pub?.item_id ?? null,
          variation_id: pub?.variation_id ?? null,
          titulo: pub?.titulo ?? null,
          seller_sku: pub?.seller_sku ?? null,
          imagen_url: pub?.imagen_url ?? null,
          cantidad_planeada: null,
          cantidad_recibida: op.cantidad ?? 0,
          fecha: op.fecha,
          crudo: op.crudo,
        });
      }
      if (lineas.length) {
        const { error: errorLineas } = await supabase.from("mercadolibre_envios_full_lineas").upsert(lineas, { onConflict: "operacion_id" });
        if (errorLineas) throw new Error(`No se pudieron guardar los productos del envío ${inboundId}: ${errorLineas.message}`);
      }
    }

    const resumen = [caminoLista && `lista: ${caminoLista}`, caminoOps && `recepciones: ${caminoOps}`, caminoDetalle && `detalle: ${caminoDetalle}`].filter(Boolean).join(" · ") || "ninguno respondió";
    const endpoint = JSON.stringify({ resumen, intentos, inventariosFull: inventariosFull.length, publicaciones: publicaciones.length });
    await supabase.from("mercadolibre_sync").upsert({ id: 1, ultima_sync_envios_full: ahora, ultimo_error_envios_full: null, endpoint_envios_full: endpoint });
    return { envios: ids.size, recibidosNuevos, endpoint: resumen, intentos, operaciones: operaciones.length, inbounds: inbounds.length };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error desconocido";
    await supabase.from("mercadolibre_sync").upsert({ id: 1, ultimo_error_envios_full: mensaje, endpoint_envios_full: JSON.stringify({ resumen: "falló", intentos }) });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Lectura local
// ---------------------------------------------------------------------------

export async function obtenerEnviosFullMl(): Promise<{ envio: EnvioFullMl; lineas: EnvioFullMlLinea[] }[]> {
  const supabase = createServiceClient();
  const { data: envios, error } = await supabase.from("mercadolibre_envios_full").select("*").order("fecha_creacion", { ascending: false, nullsFirst: false }).limit(200).returns<EnvioFullMl[]>();
  if (error) throw new Error(error.message);
  if (!envios?.length) return [];
  const { data: lineas } = await supabase
    .from("mercadolibre_envios_full_lineas")
    .select("*")
    .in("inbound_id", envios.map((e) => e.inbound_id))
    .order("fecha", { ascending: true })
    .returns<EnvioFullMlLinea[]>();
  return envios.map((envio) => ({ envio, lineas: (lineas ?? []).filter((l) => l.inbound_id === envio.inbound_id) }));
}

/** Envíos que ML ya marcó recibidos y que Isaac todavía no confirma ni descarta. */
export function enviosPorConfirmar<T extends { envio: EnvioFullMl }>(envios: T[]): T[] {
  return envios.filter(({ envio }) => (envio.estado === "RECIBIDO" || envio.estado === "CONTADO") && !envio.confirmado_en && !envio.ignorado_en);
}

/** Diagnóstico guardado de la última lectura (resumen + lo que contestó ML en cada camino). */
export function diagnosticoEnviosFull(texto: string | null | undefined): { resumen: string; intentos: string[]; inventariosFull?: number; publicaciones?: number } | null {
  if (!texto) return null;
  try {
    const j = JSON.parse(texto) as { resumen?: string; intentos?: string[]; inventariosFull?: number; publicaciones?: number };
    return { resumen: j.resumen ?? "", intentos: j.intentos ?? [], inventariosFull: j.inventariosFull, publicaciones: j.publicaciones };
  } catch {
    return { resumen: texto, intentos: [] };
  }
}

export async function obtenerEstadoEnviosFull() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("mercadolibre_sync")
    .select("ultima_sync_envios_full, ultimo_error_envios_full, endpoint_envios_full")
    .eq("id", 1)
    .maybeSingle<{ ultima_sync_envios_full: string | null; ultimo_error_envios_full: string | null; endpoint_envios_full: string | null }>();
  return data ?? null;
}

/** Junta las líneas del mismo producto (plan + recepciones) en un renglón por inventario/publicación. */
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
    };
    g.lineaIds.push(l.id);
    if (!g.titulo && l.titulo) g.titulo = l.titulo;
    if (!g.imagen_url && l.imagen_url) g.imagen_url = l.imagen_url;
    if (!g.item_id && l.item_id) g.item_id = l.item_id;
    if (!g.seller_sku && l.seller_sku) g.seller_sku = l.seller_sku;
    if (l.cantidad_planeada !== null) g.planeadas = (g.planeadas ?? 0) + l.cantidad_planeada;
    g.recibidas += l.cantidad_recibida;
    grupos.set(clave, g);
  }
  return Array.from(grupos.values());
}

// ---------------------------------------------------------------------------
// Confirmar la salida de bodega
// ---------------------------------------------------------------------------

async function bodegaPrincipal(): Promise<Bodega | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("bodegas").select("*").is("eliminado_en", null).order("creado_en").limit(1).maybeSingle<Bodega>();
  return data ?? null;
}

/** Isaac confirma: salen de bodega las piezas que ML recibió de cada
 * producto (cantidad editable), ligadas al envío de ML. También cierra las
 * líneas de los envíos armados a mano en el CRM que traigan esos SKUs, y
 * marca atendidas las recepciones detectadas por diferencia de totales. */
export async function confirmarEnvioFullMl(
  inboundId: string,
  decisiones: { clave: string; sku: string; cantidad: number; nombre?: string | null; imagenUrl?: string | null; piezasPorCaja?: number | null }[],
  bodegaId?: string | null,
) {
  const supabase = createServiceClient();
  const { data: envio } = await supabase.from("mercadolibre_envios_full").select("*").eq("inbound_id", inboundId).maybeSingle<EnvioFullMl>();
  if (!envio) return { error: "No se encontró ese envío." };
  if (envio.confirmado_en) return { error: "Ese envío ya se había confirmado." };
  const bodega = bodegaId ? { id: bodegaId } : await bodegaPrincipal();
  if (!bodega) return { error: "No hay ninguna bodega dada de alta." };
  const validas = decisiones.filter((d) => d.sku && d.cantidad > 0);
  if (!validas.length) return { error: "No hay ninguna pieza que descontar." };

  const ahora = new Date().toISOString();
  const { data: ultimos } = await supabase
    .from("movimientos_stock")
    .select("sku, nombre, imagen_url, piezas_por_caja, creado_en")
    .in("sku", validas.map((d) => d.sku))
    .order("creado_en", { ascending: false })
    .returns<{ sku: string; nombre: string; imagen_url: string | null; piezas_por_caja: number }[]>();
  const fichaPorSku = new Map<string, { nombre: string; imagen_url: string | null; piezas_por_caja: number }>();
  for (const u of ultimos ?? []) if (!fichaPorSku.has(u.sku)) fichaPorSku.set(u.sku, u);

  const filas = validas.map((d) => {
    const ficha = fichaPorSku.get(d.sku);
    return {
      tipo: "SALIDA",
      sku: d.sku,
      nombre: d.nombre ?? ficha?.nombre ?? d.sku,
      bodega_id: bodega.id,
      cantidad: Math.round(d.cantidad),
      piezas_por_caja: d.piezasPorCaja ?? ficha?.piezas_por_caja ?? 1,
      imagen_url: d.imagenUrl ?? ficha?.imagen_url ?? null,
      costo_unitario_pesos: 0,
      destino: "Full",
      referencia: `Envío a Full ${inboundId} recibido por ML`,
      inbound_ml_id: inboundId,
      creado_en: envio.fecha_recepcion ?? ahora,
    };
  });
  const { error } = await insertarMovimientosStock(supabase, filas);
  if (error) return { error: `No se pudo registrar la salida: ${error}` };

  await supabase.from("mercadolibre_envios_full").update({ confirmado_en: ahora }).eq("inbound_id", inboundId);

  // Las recepciones detectadas por diferencia de totales ya quedan explicadas.
  const skus = Array.from(new Set(validas.map((d) => d.sku)));
  await supabase.from("mercadolibre_full_recepciones").update({ atendido_en: ahora, decision: "SALIDA" }).is("atendido_en", null).in("sku_crm", skus);

  // Envíos armados a mano en el CRM (opcional): se les anota lo recibido y se cierran si ya quedaron completos.
  const { data: lineasCrm } = await supabase
    .from("envios_full_lineas")
    .select("*, envios_full!inner(estado)")
    .eq("resuelta", false)
    .in("sku", skus)
    .order("creado_en", { ascending: true })
    .returns<(EnvioFullLinea & { envios_full: { estado: string } })[]>();
  const restantePorSku = new Map(validas.map((d) => [d.sku, Math.round(d.cantidad)]));
  const enviosTocados = new Set<string>();
  for (const l of lineasCrm ?? []) {
    if (l.envios_full?.estado !== "PREPARADO") continue;
    const restante = restantePorSku.get(l.sku) ?? 0;
    if (restante <= 0) continue;
    const pendiente = l.cantidad_enviada - l.cantidad_recibida - l.merma;
    const aplica = Math.min(pendiente, restante);
    if (aplica <= 0) continue;
    await supabase
      .from("envios_full_lineas")
      .update({ cantidad_recibida: l.cantidad_recibida + aplica, resuelta: l.cantidad_recibida + aplica >= l.cantidad_enviada - l.merma })
      .eq("id", l.id);
    restantePorSku.set(l.sku, restante - aplica);
    enviosTocados.add(l.envio_id);
  }
  for (const envioId of enviosTocados) {
    const { data: pendientes } = await supabase.from("envios_full_lineas").select("id").eq("envio_id", envioId).eq("resuelta", false).limit(1);
    if (!pendientes?.length) await supabase.from("envios_full").update({ estado: "RECIBIDO", cerrado_en: ahora }).eq("id", envioId).eq("estado", "PREPARADO");
  }
  return { error: null, piezas: filas.reduce((s, f) => s + f.cantidad, 0), productos: filas.length };
}

export async function ignorarEnvioFullMl(inboundId: string) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("mercadolibre_envios_full").update({ ignorado_en: new Date().toISOString() }).eq("inbound_id", inboundId).is("confirmado_en", null);
  return { error: error?.message ?? null };
}

/** Deshacer una confirmación (mismo día): borra las salidas ligadas y vuelve a dejar el envío por confirmar. */
export async function deshacerConfirmacionEnvioMl(inboundId: string) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("movimientos_stock").delete().eq("inbound_ml_id", inboundId);
  if (error) return { error: error.message };
  await supabase.from("mercadolibre_envios_full").update({ confirmado_en: null }).eq("inbound_id", inboundId);
  return { error: null };
}

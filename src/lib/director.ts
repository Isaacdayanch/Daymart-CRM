// Director de Mercado Libre — reglas compartidas (puro, sin base de datos).
// Las usan la pantalla /director, las puertas /api/director/* y las acciones.

import type { AreaDirector, EstadoPropuestaDirector, PropuestaDirector } from "./tipos";

export const AREAS_DIRECTOR: { valor: AreaDirector; etiqueta: string; emoji: string; orden: number }[] = [
  { valor: "RELAMPAGO", etiqueta: "Ofertas relámpago", emoji: "🔥", orden: 1 },
  { valor: "FULL", etiqueta: "Full", emoji: "📦", orden: 2 },
  { valor: "PROMOCION", etiqueta: "Promociones", emoji: "💸", orden: 3 },
  { valor: "PUBLICIDAD", etiqueta: "Publicidad", emoji: "📣", orden: 4 },
  { valor: "PUBLICACION", etiqueta: "Publicaciones", emoji: "🖼️", orden: 5 },
  { valor: "LIGA", etiqueta: "Ligas de SKU", emoji: "🔗", orden: 6 },
  { valor: "AVISO", etiqueta: "Avisos", emoji: "⚠️", orden: 7 },
  { valor: "OTRO", etiqueta: "Otros", emoji: "📝", orden: 8 },
];

export const ETIQUETA_AREA: Record<AreaDirector, string> = Object.fromEntries(AREAS_DIRECTOR.map((a) => [a.valor, a.etiqueta])) as Record<AreaDirector, string>;

export const ETIQUETA_ESTADO: Record<EstadoPropuestaDirector, string> = {
  PROPUESTA: "Esperando tu decisión",
  APROBADA: "Aprobada · falta ejecutarla",
  RECHAZADA: "Rechazada",
  EJECUTADA: "Hecha",
  FALLIDA: "Falló al ejecutar",
  CADUCADA: "Caducó",
};

/** Qué puede ejecutar el CRM por sí solo (fase 2 en adelante). MANUAL = Isaac
 * la hace a mano y la marca como hecha. */
export const ACCIONES_DIRECTOR: Record<string, { etiqueta: string; automatica: boolean }> = {
  MANUAL: { etiqueta: "La haces tú a mano", automatica: false },
  PROMOCION_DESCUENTO: { etiqueta: "El CRM aplica el descuento del vendedor", automatica: true },
  PARTICIPAR_PROMOCION: { etiqueta: "El CRM participa en la promoción de ML", automatica: true },
  QUITAR_PROMOCION: { etiqueta: "El CRM quita la promoción", automatica: true },
  ADS: { etiqueta: "El CRM cambia la publicidad", automatica: true },
  PUBLICACION: { etiqueta: "El CRM edita la publicación", automatica: true },
  RESPONDER_PREGUNTA: { etiqueta: "El CRM responde la pregunta", automatica: true },
};

export function esAreaValida(x: unknown): x is AreaDirector {
  return typeof x === "string" && AREAS_DIRECTOR.some((a) => a.valor === x);
}

export interface PropuestaEntrante {
  area: AreaDirector;
  titulo: string;
  detalle?: string | null;
  porque?: string | null;
  datos?: Record<string, unknown>;
  accion_tipo?: string;
  item_id?: string | null;
  sku_crm?: string | null;
  imagen_url?: string | null;
  precio_propuesto?: number | null;
}

/** Valida lo que manda el Director. Devuelve la lista limpia o el error en
 * español (para que el Director sepa qué corregir). */
export function validarPropuestasEntrantes(crudo: unknown): { propuestas: PropuestaEntrante[] } | { error: string } {
  if (!Array.isArray(crudo)) return { error: "«propuestas» debe ser una lista." };
  if (crudo.length === 0) return { error: "La lista de propuestas viene vacía." };
  if (crudo.length > 60) return { error: "Máximo 60 propuestas por lote (Isaac las lee en el celular)." };
  const propuestas: PropuestaEntrante[] = [];
  for (let i = 0; i < crudo.length; i++) {
    const p = crudo[i] as Record<string, unknown>;
    if (!p || typeof p !== "object") return { error: `La propuesta ${i + 1} no es un objeto.` };
    if (!esAreaValida(p.area)) return { error: `La propuesta ${i + 1} trae un área inválida (${String(p.area)}). Válidas: ${AREAS_DIRECTOR.map((a) => a.valor).join(", ")}.` };
    const titulo = typeof p.titulo === "string" ? p.titulo.trim() : "";
    if (!titulo) return { error: `La propuesta ${i + 1} no trae título.` };
    if (titulo.length > 200) return { error: `El título de la propuesta ${i + 1} es muy largo (máx. 200).` };
    const accion = typeof p.accion_tipo === "string" && p.accion_tipo ? p.accion_tipo : "MANUAL";
    if (!ACCIONES_DIRECTOR[accion]) return { error: `La propuesta ${i + 1} trae un accion_tipo desconocido (${accion}). Válidos: ${Object.keys(ACCIONES_DIRECTOR).join(", ")}.` };
    const precio = p.precio_propuesto === null || p.precio_propuesto === undefined ? null : Number(p.precio_propuesto);
    if (precio !== null && (!Number.isFinite(precio) || precio < 0)) return { error: `La propuesta ${i + 1} trae un precio inválido.` };
    propuestas.push({
      area: p.area,
      titulo,
      detalle: typeof p.detalle === "string" ? p.detalle.slice(0, 2000) : null,
      porque: typeof p.porque === "string" ? p.porque.slice(0, 1000) : null,
      datos: p.datos && typeof p.datos === "object" && !Array.isArray(p.datos) ? (p.datos as Record<string, unknown>) : {},
      accion_tipo: accion,
      item_id: typeof p.item_id === "string" ? p.item_id : null,
      sku_crm: typeof p.sku_crm === "string" ? p.sku_crm : null,
      imagen_url: typeof p.imagen_url === "string" ? p.imagen_url : null,
      precio_propuesto: precio,
    });
  }
  return { propuestas };
}

/** Orden de pantalla: por área (según AREAS_DIRECTOR) y luego por número. */
export function ordenarPropuestas<T extends Pick<PropuestaDirector, "area" | "orden">>(lista: T[]): T[] {
  const peso = new Map(AREAS_DIRECTOR.map((a) => [a.valor, a.orden]));
  return [...lista].sort((a, b) => (peso.get(a.area) ?? 99) - (peso.get(b.area) ?? 99) || a.orden - b.orden);
}

export function agruparPorArea<T extends Pick<PropuestaDirector, "area" | "orden">>(lista: T[]): { area: AreaDirector; etiqueta: string; emoji: string; propuestas: T[] }[] {
  const grupos = new Map<AreaDirector, T[]>();
  for (const p of ordenarPropuestas(lista)) {
    const g = grupos.get(p.area) ?? [];
    g.push(p);
    grupos.set(p.area, g);
  }
  return AREAS_DIRECTOR.filter((a) => grupos.has(a.valor)).map((a) => ({ area: a.valor, etiqueta: a.etiqueta, emoji: a.emoji, propuestas: grupos.get(a.valor)! }));
}

/** Texto corto de una propuesta para la bitácora y los mensajes. */
export function resumenPropuesta(p: Pick<PropuestaDirector, "orden" | "titulo" | "precio_propuesto" | "precio_aprobado">) {
  const precio = p.precio_aprobado ?? p.precio_propuesto;
  return `#${p.orden} ${p.titulo}${precio !== null && precio !== undefined ? ` — $${Number(precio).toLocaleString("es-MX")}` : ""}`;
}

export function mensajeErrorDirector(e: { message: string }) {
  if (/director_mensajes/.test(e.message) && /does not exist|schema cache/i.test(e.message)) {
    return "Falta correr el SQL 0059 en Supabase (mensajes de WhatsApp del Director).";
  }
  if (/director_propuestas|director_bitacora/.test(e.message) && /does not exist|schema cache/i.test(e.message)) {
    return "Falta correr el SQL 0058 en Supabase (tablas del Director).";
  }
  return e.message;
}

// Etiquetas de producto (Isaac, 19 oct): SKU + nombre + código de barras
// del "Código ML" de Full (el que Mercado Libre escanea al recibir envíos a
// Full, tipo IBHA96856). Sin imagen. Si el producto está ligado a Mercado
// Libre el código se toma solo de la publicación (su `inventory_id`); si
// no, Isaac lo captura en el producto; sin código, la etiqueta sale sin
// código de barras (solo SKU y nombre).

import { claveVinculo, obtenerPublicaciones, obtenerVinculos, skuCrmDe } from "./mercadolibre-stock";
import type { CamposMancuerna } from "./mancuernas";

/** Formatos de impresión. Medidas en mm. `hoja` = null es rollo (cada
 * etiqueta es una página, para impresoras térmicas); con `hoja` es una hoja
 * carta con rejilla de etiquetas adhesivas (medidas tipo Avery). */
export interface FormatoEtiqueta {
  id: string;
  nombre: string;
  descripcion: string;
  ancho: number;
  alto: number;
  columnas: number;
  filas: number;
  hoja: { ancho: number; alto: number; margenSup: number; margenIzq: number; sepX: number; sepY: number } | null;
}

export const FORMATOS_ETIQUETA: FormatoEtiqueta[] = [
  { id: "rollo-50x25", nombre: "Rollo 50 × 25 mm", descripcion: "impresora térmica de etiquetas (una por etiqueta)", ancho: 50, alto: 25, columnas: 1, filas: 1, hoja: null },
  { id: "rollo-100x50", nombre: "Rollo 100 × 50 mm", descripcion: "impresora térmica, etiqueta grande", ancho: 100, alto: 50, columnas: 1, filas: 1, hoja: null },
  {
    id: "carta-30",
    nombre: "Hoja carta · 30 etiquetas (3 × 10)",
    descripcion: "etiquetas adhesivas de 66.7 × 25.4 mm (tipo Avery 5160)",
    ancho: 66.675,
    alto: 25.4,
    columnas: 3,
    filas: 10,
    hoja: { ancho: 215.9, alto: 279.4, margenSup: 12.7, margenIzq: 4.7625, sepX: 3.175, sepY: 0 },
  },
  {
    id: "carta-14",
    nombre: "Hoja carta · 14 etiquetas (2 × 7)",
    descripcion: "etiquetas adhesivas de 101.6 × 33.9 mm (tipo Avery 5162)",
    ancho: 101.6,
    alto: 33.867,
    columnas: 2,
    filas: 7,
    hoja: { ancho: 215.9, alto: 279.4, margenSup: 21.167, margenIzq: 3.96875, sepX: 4.7625, sepY: 0 },
  },
];

export function formatoPorId(id: string | null | undefined): FormatoEtiqueta {
  return FORMATOS_ETIQUETA.find((f) => f.id === id) ?? FORMATOS_ETIQUETA[0];
}

export type OrigenCodigoMl = "producto" | "catalogo" | "mercadolibre" | null;

export interface ProductoEtiqueta {
  sku: string;
  nombre: string;
  imagenUrl: string | null;
  /** Código que va en la barra (Código ML de Full) o null = sin código de barras. */
  codigoMl: string | null;
  origenCodigo: OrigenCodigoMl;
  /** Otros códigos que ML tiene para este SKU (ej. dos inventarios distintos). */
  otrosCodigosMl: string[];
  /** "15 lb (6.8 kg) · por par" si es mancuerna. */
  detalle: string | null;
  /** Etiquetas propuestas (cantidad del contenedor, o 1). */
  copiasPropuestas: number;
}

/** Códigos ML (inventory_id de Full) por SKU del CRM, según las ligas con
 * Mercado Libre (mismo orden de resolución que el resto del sistema). Las
 * publicaciones activas van primero. Nunca truena: sin conexión/SQL
 * devuelve un mapa vacío. */
export async function codigosMlPorSku(skusCrm: Set<string>): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>();
  try {
    const [publicaciones, vinculos] = await Promise.all([obtenerPublicaciones(), obtenerVinculos()]);
    const ligas = new Map(vinculos.map((v) => [claveVinculo(v.item_id, v.variation_id), v.sku_crm]));
    const ordenadas = [...publicaciones].sort((a, b) => Number(b.estado === "active") - Number(a.estado === "active"));
    for (const p of ordenadas) {
      if (!p.inventory_id) continue;
      const { sku } = skuCrmDe(p, ligas, skusCrm);
      if (!sku) continue;
      const lista = mapa.get(sku) ?? [];
      if (!lista.includes(p.inventory_id)) lista.push(p.inventory_id);
      mapa.set(sku, lista);
    }
  } catch {
    // Sin Mercado Libre conectado o sin sus tablas: las etiquetas solo usan el código capturado.
  }
  return mapa;
}

/** Decide qué código va en la etiqueta: el capturado en el producto del
 * contenedor, luego el de la ficha del catálogo, luego el de Mercado Libre. */
export function resolverCodigoMl(
  codigoProducto: string | null | undefined,
  codigoCatalogo: string | null | undefined,
  codigosMl: string[] | undefined,
): { codigoMl: string | null; origenCodigo: OrigenCodigoMl; otrosCodigosMl: string[] } {
  const limpio = (v: string | null | undefined) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : null);
  const deMl = codigosMl ?? [];
  const p = limpio(codigoProducto);
  if (p) return { codigoMl: p, origenCodigo: "producto", otrosCodigosMl: deMl.filter((c) => c !== p) };
  const c = limpio(codigoCatalogo);
  if (c) return { codigoMl: c, origenCodigo: "catalogo", otrosCodigosMl: deMl.filter((x) => x !== c) };
  if (deMl.length > 0) return { codigoMl: deMl[0], origenCodigo: "mercadolibre", otrosCodigosMl: deMl.slice(1) };
  return { codigoMl: null, origenCodigo: null, otrosCodigosMl: [] };
}

export function textoOrigenCodigo(origen: OrigenCodigoMl): string {
  switch (origen) {
    case "producto":
      return "capturado en el producto";
    case "catalogo":
      return "capturado en la ficha";
    case "mercadolibre":
      return "tomado de Mercado Libre";
    default:
      return "sin código";
  }
}

/** Datos de mancuerna que se imprimen chiquitos en la etiqueta. */
export type DetalleEtiqueta = CamposMancuerna;

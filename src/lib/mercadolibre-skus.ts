// "Ligar SKUs" (Isaac, 7 oct: "lo administramos todo sobre ese SKU; si hay
// algo que no hace match o tienes duda, pregúntame"). Agrupa las
// publicaciones de ML por el SKU que Isaac les puso, dice cuáles ya
// resuelven a un producto del CRM y cuáles están pendientes, y para las
// pendientes propone el producto más parecido por nombre.

import { claveLigaSku, claveVinculo, factorDePublicacion, factoresVinculos, normalizarSellerSku, skuCrmDe, type OrigenLiga, type PublicacionMl, type VinculoMl } from "./mercadolibre-stock";

export interface ProductoCrmResumen {
  sku: string;
  nombre: string;
  imagenUrl: string | null;
  stockActual: number;
}

export interface PublicacionResumen {
  id: string;
  item_id: string;
  variation_id: number | null;
  titulo: string | null;
  variacion: string | null;
  imagen_url: string | null;
  estado: string | null;
  logistica: string | null;
  /** Cómo resuelve ESTA publicación hoy. */
  skuCrm: string | null;
  nombreCrm: string | null;
  origen: OrigenLiga;
  factor: number;
  /** Propuesta por nombre parecido (incluye el color/variante). */
  sugerencia: { sku: string; nombre: string; puntos: number } | null;
}

export interface GrupoSkuMl {
  sellerSku: string;
  publicaciones: PublicacionResumen[];
  estado: "pendiente" | "ligado" | "igual";
  skuCrm: string | null;
  nombreCrm: string | null;
  factor: number;
  /** Propuesta por nombre parecido (solo pendientes). */
  sugerencia: { sku: string; nombre: string; puntos: number } | null;
  activa: boolean;
  /** true si trae varias variantes (colores/tallas): cada una puede ligarse aparte. */
  conVariantes: boolean;
}

const VACIAS = new Set(["DE", "DEL", "LA", "EL", "LOS", "LAS", "PARA", "CON", "Y", "O", "EN", "UN", "UNA", "POR", "A", "AL", "COLOR", "DAYMART", "GYM", "CASA", "PIEZAS", "PZAS", "KG", "CM", "MM"]);

function tokens(texto: string | null | undefined) {
  return new Set(
    (texto ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter((t) => t.length >= 3 && !VACIAS.has(t)),
  );
}

/** Puntos de parecido entre una publicación (título + variante + SKU de ML)
 * y un producto del CRM (nombre + SKU): palabras en común. */
export function puntosParecido(pub: { titulo: string | null; variacion: string | null; sellerSku: string }, prod: { sku: string; nombre: string }) {
  const a = tokens(`${pub.titulo ?? ""} ${pub.variacion ?? ""}`);
  const b = tokens(prod.nombre);
  let puntos = 0;
  for (const t of a) if (b.has(t)) puntos += 1;
  // Partes del SKU de ML que aparecen en el SKU del CRM (ej. BANC, ROMAN).
  const partesMl = pub.sellerSku.toUpperCase().split(/[^A-Z0-9]+/).filter((p) => p.length >= 3);
  const skuCrm = prod.sku.toUpperCase();
  for (const parte of partesMl) if (skuCrm.includes(parte)) puntos += 1.5;
  return puntos;
}

export function sugerirProducto(pub: { titulo: string | null; variacion: string | null; sellerSku: string }, productos: ProductoCrmResumen[]) {
  let mejor: { sku: string; nombre: string; puntos: number } | null = null;
  for (const p of productos) {
    const puntos = puntosParecido(pub, p);
    if (puntos >= 2 && (!mejor || puntos > mejor.puntos)) mejor = { sku: p.sku, nombre: p.nombre, puntos };
  }
  return mejor;
}

export function agruparPorSkuMl(publicaciones: PublicacionMl[], vinculos: VinculoMl[], productos: ProductoCrmResumen[]): { grupos: GrupoSkuMl[]; sinSku: PublicacionResumen[] } {
  const mapaVinculos = new Map(vinculos.map((v) => [claveVinculo(v.item_id, v.variation_id), v.sku_crm]));
  const factores = factoresVinculos(vinculos);
  const skusCrm = new Set(productos.map((p) => p.sku));
  const nombrePorSku = new Map(productos.map((p) => [p.sku, p.nombre]));
  const porSku = new Map<string, PublicacionMl[]>();
  const sinSku: PublicacionResumen[] = [];
  const resumen = (p: PublicacionMl): PublicacionResumen => {
    const liga = skuCrmDe(p, mapaVinculos, skusCrm);
    const sellerSku = normalizarSellerSku(p.seller_sku) ?? "";
    return {
      id: p.id,
      item_id: p.item_id,
      variation_id: p.variation_id,
      titulo: p.titulo,
      variacion: p.variacion,
      imagen_url: p.imagen_url,
      estado: p.estado,
      logistica: p.logistica,
      skuCrm: liga.sku,
      nombreCrm: liga.sku ? (nombrePorSku.get(liga.sku) ?? null) : null,
      origen: liga.origen,
      factor: factorDePublicacion(p.item_id, p.variation_id, factores, p.seller_sku),
      sugerencia: liga.sku ? null : sugerirProducto({ titulo: p.titulo, variacion: p.variacion, sellerSku }, productos),
    };
  };
  for (const p of publicaciones) {
    const k = normalizarSellerSku(p.seller_sku);
    if (!k) {
      sinSku.push(resumen(p));
      continue;
    }
    porSku.set(k, [...(porSku.get(k) ?? []), p]);
  }
  const grupos: GrupoSkuMl[] = [];
  for (const [sellerSku, pubs] of porSku) {
    const principal = [...pubs].sort((a, b) => Number(a.catalogo) - Number(b.catalogo) || Number(b.estado === "active") - Number(a.estado === "active"))[0];
    const resumenes = pubs.map(resumen);
    // Liga del SKU en sí (sin contar ligas propias de cada variante).
    const ligaSku = mapaVinculos.get(claveLigaSku(sellerSku)) ?? (skusCrm.has(sellerSku) ? sellerSku : null);
    const origenSku: OrigenLiga = mapaVinculos.get(claveLigaSku(sellerSku)) ? "sku" : ligaSku ? "auto" : null;
    // Pendiente si CUALQUIER publicación del grupo no resuelve a un producto.
    const estado: GrupoSkuMl["estado"] = resumenes.some((r) => !r.skuCrm) ? "pendiente" : origenSku === "auto" && resumenes.every((r) => r.origen === "auto") ? "igual" : "ligado";
    const variantes = new Set(pubs.filter((p) => p.variation_id !== null).map((p) => p.variacion ?? String(p.variation_id)));
    grupos.push({
      sellerSku,
      publicaciones: resumenes,
      estado,
      skuCrm: ligaSku,
      nombreCrm: ligaSku ? (nombrePorSku.get(ligaSku) ?? null) : null,
      factor: factorDePublicacion(principal.item_id, principal.variation_id, factores, sellerSku),
      sugerencia: estado === "pendiente" ? sugerirProducto({ titulo: principal.titulo, variacion: principal.variacion, sellerSku }, productos) : null,
      activa: pubs.some((p) => p.estado === "active"),
      conVariantes: variantes.size >= 2,
    });
  }
  const orden = { pendiente: 0, ligado: 1, igual: 2 };
  grupos.sort((a, b) => orden[a.estado] - orden[b.estado] || Number(b.activa) - Number(a.activa) || a.sellerSku.localeCompare(b.sellerSku));
  // Publicaciones sin SKU en ML: todas (ligadas por publicación o no), las
  // pendientes primero, para que ninguna "desaparezca" de esta pantalla.
  sinSku.sort((a, b) => Number(Boolean(a.skuCrm)) - Number(Boolean(b.skuCrm)) || (a.titulo ?? "").localeCompare(b.titulo ?? "", "es"));
  return { grupos, sinSku };
}

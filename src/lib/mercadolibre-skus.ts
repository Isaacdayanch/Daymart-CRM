// "Ligar SKUs" (Isaac, 7 oct: "lo administramos todo sobre ese SKU; si hay
// algo que no hace match o tienes duda, pregúntame"). Agrupa las
// publicaciones de ML por el SKU que Isaac les puso, dice cuáles ya
// resuelven a un producto del CRM y cuáles están pendientes, y para las
// pendientes propone el producto más parecido por nombre.

import { sugerirProducto } from "./sugerir-producto";
import { claveLigaSku, claveVinculo, factorDePublicacion, factoresVinculos, normalizarSellerSku, skuCrmDe, type OrigenLiga, type PublicacionMl, type VinculoMl } from "./mercadolibre-stock";

export { puntosParecido, sugerirProducto } from "./sugerir-producto";

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
  /** Isaac la marcó "olvidar" (solo aplica a publicaciones sin SKU en ML). */
  ignorado: boolean;
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
  /** Isaac marcó este SKU como "olvidar": no cuenta como pendiente. */
  ignorado: boolean;
}

/** Pendiente de verdad = no resuelve, tiene alguna publicación activa y no está olvidado. */
export function esPendienteReal(g: GrupoSkuMl) {
  return g.estado === "pendiente" && g.activa && !g.ignorado;
}
export function esPublicacionPendienteReal(p: PublicacionResumen) {
  return !p.skuCrm && p.estado === "active" && !p.ignorado;
}

export function agruparPorSkuMl(publicaciones: PublicacionMl[], vinculos: VinculoMl[], productos: ProductoCrmResumen[], ignorados: Set<string> = new Set()): { grupos: GrupoSkuMl[]; sinSku: PublicacionResumen[] } {
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
      factor: factorDePublicacion(p.item_id, p.variation_id, factores, p.seller_sku, p.inventory_id),
      sugerencia: liga.sku ? null : sugerirProducto({ titulo: p.titulo, variacion: p.variacion, sellerSku }, productos),
      ignorado: ignorados.has(claveVinculo(p.item_id, p.variation_id)),
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
      factor: factorDePublicacion(principal.item_id, principal.variation_id, factores, sellerSku, principal.inventory_id),
      sugerencia: estado === "pendiente" ? sugerirProducto({ titulo: principal.titulo, variacion: principal.variacion, sellerSku }, productos) : null,
      activa: pubs.some((p) => p.estado === "active"),
      conVariantes: variantes.size >= 2,
      ignorado: ignorados.has(claveLigaSku(sellerSku)),
    });
  }
  const orden = { pendiente: 0, ligado: 1, igual: 2 };
  grupos.sort((a, b) => orden[a.estado] - orden[b.estado] || Number(b.activa) - Number(a.activa) || a.sellerSku.localeCompare(b.sellerSku));
  // Publicaciones sin SKU en ML: todas (ligadas por publicación o no), las
  // pendientes primero, para que ninguna "desaparezca" de esta pantalla.
  sinSku.sort((a, b) => Number(Boolean(a.skuCrm)) - Number(Boolean(b.skuCrm)) || (a.titulo ?? "").localeCompare(b.titulo ?? "", "es"));
  return { grupos, sinSku };
}

// Ligar por Código ML (21 oct; Isaac: "no me gusta cómo se liga, no es
// constante ni consistente"). En Full cada producto físico tiene su Código ML
// (inventory_id): la publicación normal y la de catálogo lo comparten y cada
// color tiene el suyo. Aquí se agrupan las publicaciones por ese código para
// la pantalla de ligar: un renglón = un producto de ML = una liga.

import { sugerirProducto } from "./sugerir-producto";
import { claveCodigoMl, claveVinculo, factoresVinculos, factorDePublicacion, normalizarCodigoMl, skuCrmDe, type OrigenLiga, type PublicacionMl, type VinculoMl } from "./mercadolibre-stock";

export interface PublicacionDeCodigo {
  item_id: string;
  variation_id: number | null;
  titulo: string | null;
  variacion: string | null;
  estado: string | null;
  catalogo: boolean;
  seller_sku: string | null;
}

export interface CandidatoCodigo {
  sku: string;
  nombre: string | null;
  /** Cómo llegó este candidato (publicación, SKU de ML, SKU igual). */
  origen: OrigenLiga;
}

export interface GrupoCodigoMl {
  inventoryId: string;
  titulo: string;
  imagenUrl: string | null;
  sellerSku: string | null;
  publicaciones: PublicacionDeCodigo[];
  activa: boolean;
  /** Piezas disponibles en Full (de ML, sin convertir). */
  enFull: number;
  /**
   * - ligado: tiene su liga por Código ML.
   * - heredado: sin liga propia, pero sus publicaciones ya caen en UN producto
   *   por ligas viejas (publicación / SKU de ML / SKU igual).
   * - contradiccion: sus publicaciones caen en productos DISTINTOS.
   * - pendiente: no cae en ningún producto.
   */
  estado: "ligado" | "heredado" | "contradiccion" | "pendiente";
  skuCrm: string | null;
  nombreCrm: string | null;
  origen: OrigenLiga;
  factor: number;
  candidatos: CandidatoCodigo[];
  sugerencia: { sku: string; nombre: string; puntos: number } | null;
  ignorado: boolean;
}

export function esCodigoPendiente(g: GrupoCodigoMl) {
  return (g.estado === "pendiente" || g.estado === "contradiccion") && g.activa && !g.ignorado;
}

export function agruparPorCodigoMl(
  publicaciones: PublicacionMl[],
  vinculos: VinculoMl[],
  productos: { sku: string; nombre: string }[],
  skusCrm: Set<string>,
  ignorados: Set<string> = new Set(),
): GrupoCodigoMl[] {
  const mapa = new Map(vinculos.map((v) => [claveVinculo(v.item_id, v.variation_id), v.sku_crm]));
  // Igual que `mapa`, pero SIN las ligas por código: para ver a qué caían sus
  // publicaciones con las ligas viejas (herencia y contradicciones).
  const mapaSinCodigo = new Map(vinculos.filter((v) => !v.por_codigo).map((v) => [claveVinculo(v.item_id, v.variation_id), v.sku_crm]));
  const factores = factoresVinculos(vinculos);
  const nombrePorSku = new Map(productos.map((p) => [p.sku, p.nombre]));

  const porCodigo = new Map<string, PublicacionMl[]>();
  for (const p of publicaciones) {
    const k = normalizarCodigoMl(p.inventory_id);
    if (k) porCodigo.set(k, [...(porCodigo.get(k) ?? []), p]);
  }

  const grupos: GrupoCodigoMl[] = [];
  for (const [inventoryId, pubs] of porCodigo) {
    const principal = [...pubs].sort((a, b) => Number(a.catalogo) - Number(b.catalogo) || Number(b.estado === "active") - Number(a.estado === "active"))[0];
    const ligado = mapa.get(claveCodigoMl(inventoryId)) ?? null;
    const candidatos = new Map<string, CandidatoCodigo>();
    for (const p of pubs) {
      const r = skuCrmDe({ ...p, inventory_id: null }, mapaSinCodigo, skusCrm);
      if (r.sku && !candidatos.has(r.sku)) candidatos.set(r.sku, { sku: r.sku, nombre: nombrePorSku.get(r.sku) ?? null, origen: r.origen });
    }
    const lista = Array.from(candidatos.values());
    const estado: GrupoCodigoMl["estado"] = ligado ? "ligado" : lista.length === 1 ? "heredado" : lista.length > 1 ? "contradiccion" : "pendiente";
    const skuCrm = ligado ?? (lista.length === 1 ? lista[0].sku : null);
    const titulo = [principal.titulo, principal.variacion].filter(Boolean).join(" · ") || inventoryId;
    grupos.push({
      inventoryId,
      titulo,
      imagenUrl: pubs.find((p) => p.imagen_url)?.imagen_url ?? null,
      sellerSku: principal.seller_sku,
      publicaciones: pubs.map((p) => ({ item_id: p.item_id, variation_id: p.variation_id, titulo: p.titulo, variacion: p.variacion, estado: p.estado, catalogo: p.catalogo, seller_sku: p.seller_sku })),
      activa: pubs.some((p) => p.estado === "active"),
      enFull: Math.max(0, ...pubs.map((p) => Number(p.full_disponible) || 0)),
      estado,
      skuCrm,
      nombreCrm: skuCrm ? (nombrePorSku.get(skuCrm) ?? null) : null,
      origen: ligado ? "codigo" : lista.length === 1 ? lista[0].origen : null,
      factor: factorDePublicacion(principal.item_id, principal.variation_id, factores, principal.seller_sku, inventoryId),
      candidatos: estado === "contradiccion" ? lista : [],
      sugerencia: skuCrm ? null : sugerirProducto({ titulo: principal.titulo, variacion: principal.variacion, sellerSku: principal.seller_sku ?? "" }, productos),
      ignorado: ignorados.has(claveCodigoMl(inventoryId)),
    });
  }
  const orden = { contradiccion: 0, pendiente: 1, heredado: 2, ligado: 3 };
  grupos.sort((a, b) => orden[a.estado] - orden[b.estado] || Number(b.activa) - Number(a.activa) || b.enFull - a.enFull || a.titulo.localeCompare(b.titulo, "es"));
  return grupos;
}

import Link from "next/link";
import { normalizarSellerSku, obtenerPublicaciones, obtenerVinculos, skuCrmDe, claveVinculo } from "@/lib/mercadolibre-stock";

/** Aviso ámbar "N SKUs de ML pendientes de ligar" (se usa en Publicaciones y
 * en Full y ML). `skusCrm` = SKUs que existen en el CRM. */
export async function AvisoSkusPendientes({ skusCrm }: { skusCrm: Set<string> }) {
  let pendientes = 0;
  try {
    const [publicaciones, vinculos] = await Promise.all([obtenerPublicaciones(), obtenerVinculos()]);
    const mapa = new Map(vinculos.map((v) => [claveVinculo(v.item_id, v.variation_id), v.sku_crm]));
    const vistos = new Set<string>();
    for (const p of publicaciones) {
      const k = normalizarSellerSku(p.seller_sku);
      if (!k || vistos.has(k)) continue;
      vistos.add(k);
      if (!skuCrmDe(p, mapa, skusCrm).sku) pendientes += 1;
    }
  } catch {
    return null;
  }
  if (pendientes === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <span>
        <strong>{pendientes}</strong> SKU(s) de Mercado Libre todavía no están ligados a un producto del CRM: sus ventas y envíos a Full no pueden descontar de tu bodega.
      </span>
      <Link href="/mercadolibre/skus" className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700">
        Ligar SKUs →
      </Link>
    </div>
  );
}

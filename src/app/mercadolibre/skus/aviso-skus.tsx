import Link from "next/link";
import { claveLigaSku, claveVinculo, normalizarSellerSku, obtenerIgnorados, obtenerPublicaciones, obtenerVinculos, skuCrmDe } from "@/lib/mercadolibre-stock";

/** Aviso ámbar "N SKUs de ML pendientes de ligar" (se usa en Publicaciones y
 * en Full y ML). Solo cuenta lo que importa: SKUs con alguna publicación
 * ACTIVA que no resuelve y que Isaac no haya marcado "olvidar". */
export async function AvisoSkusPendientes({ skusCrm }: { skusCrm: Set<string> }) {
  let pendientes = 0;
  let sinSku = 0;
  try {
    const [publicaciones, vinculos, ignoradosLista] = await Promise.all([obtenerPublicaciones(), obtenerVinculos(), obtenerIgnorados()]);
    const mapa = new Map(vinculos.map((v) => [claveVinculo(v.item_id, v.variation_id), v.sku_crm]));
    const ignorados = new Set(ignoradosLista.map((i) => i.clave));
    const porSku = new Map<string, { sinResolver: boolean; activa: boolean }>();
    for (const p of publicaciones) {
      const resuelve = Boolean(skuCrmDe(p, mapa, skusCrm).sku);
      const k = normalizarSellerSku(p.seller_sku);
      if (!k) {
        if (!resuelve && p.estado === "active" && !ignorados.has(claveVinculo(p.item_id, p.variation_id))) sinSku += 1;
        continue;
      }
      const g = porSku.get(k) ?? { sinResolver: false, activa: false };
      if (!resuelve) g.sinResolver = true;
      if (p.estado === "active") g.activa = true;
      porSku.set(k, g);
    }
    for (const [k, g] of porSku) if (g.sinResolver && g.activa && !ignorados.has(claveLigaSku(k))) pendientes += 1;
  } catch {
    return null;
  }
  if (pendientes === 0 && sinSku === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <span>
        {pendientes > 0 && (
          <>
            <strong>{pendientes}</strong> SKU(s) de Mercado Libre activos todavía no están ligados a un producto del CRM
          </>
        )}
        {pendientes > 0 && sinSku > 0 && " y "}
        {sinSku > 0 && (
          <>
            <strong>{sinSku}</strong> publicación(es) activas sin SKU en ML siguen sin ligar
          </>
        )}
        : sus ventas y envíos a Full no pueden descontar de tu bodega.
      </span>
      <Link href="/mercadolibre/skus" className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700">
        Ligar SKUs →
      </Link>
    </div>
  );
}

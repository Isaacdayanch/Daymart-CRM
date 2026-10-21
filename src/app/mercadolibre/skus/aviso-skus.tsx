import Link from "next/link";
import { claveLigaSku, claveVinculo, normalizarSellerSku, obtenerIgnorados, obtenerPublicaciones, obtenerVinculos, skuCrmDe } from "@/lib/mercadolibre-stock";
import { agruparPorCodigoMl, esCodigoPendiente } from "@/lib/mercadolibre-codigos";

/** Aviso ámbar "N productos de ML sin ligar" (se usa en Publicaciones y en
 * Full y ML). Solo cuenta lo que importa: Códigos ML de Full (y, fuera de
 * Full, SKUs/publicaciones) con algo ACTIVO que no resuelve y que Isaac no
 * haya marcado "olvidar". */
export async function AvisoSkusPendientes({ skusCrm }: { skusCrm: Set<string> }) {
  let pendientes = 0;
  let sinSku = 0;
  let codigos = 0;
  try {
    const [publicaciones, vinculos, ignoradosLista] = await Promise.all([obtenerPublicaciones(), obtenerVinculos(), obtenerIgnorados()]);
    const mapa = new Map(vinculos.map((v) => [claveVinculo(v.item_id, v.variation_id), v.sku_crm]));
    const ignorados = new Set(ignoradosLista.map((i) => i.clave));
    codigos = agruparPorCodigoMl(publicaciones, vinculos, [], skusCrm, ignorados).filter(esCodigoPendiente).length;
    const porSku = new Map<string, { sinResolver: boolean; activa: boolean }>();
    // Fuera de Full (sin Código ML): por SKU de ML o publicación, como antes.
    for (const p of publicaciones.filter((x) => !x.inventory_id)) {
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
  if (pendientes === 0 && sinSku === 0 && codigos === 0) return null;
  const partes = [
    codigos ? `${codigos} producto(s) en Full (Código ML)` : null,
    pendientes ? `${pendientes} SKU(s) de ML fuera de Full` : null,
    sinSku ? `${sinSku} publicación(es) sin SKU fuera de Full` : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <span>
        Sin ligar a un producto del CRM: <strong>{partes.join(", ")}</strong>. Sus ventas y envíos a Full no pueden descontar de tu bodega.
      </span>
      <Link href={codigos ? "/mercadolibre/skus" : "/mercadolibre/skus?vista=sinfull"} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700">
        Ligar →
      </Link>
    </div>
  );
}

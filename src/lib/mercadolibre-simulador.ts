// Comisión REAL de Mercado Libre vía su API (lo mismo que consulta el
// simulador oficial), para que Research la llene sola en vez de que Isaac
// la copie a mano.

import { mercadolibreGet } from "@/lib/mercadolibre-auth";

export interface ComisionMl {
  tipoPublicacion: string; // gold_special | gold_pro
  nombre: string; // Clásica | Premium
  monto: number;
  porcentaje: number | null;
  fijo: number | null;
}

interface ListingPriceApi {
  listing_type_id: string;
  listing_type_name?: string;
  sale_fee_amount?: number;
  sale_fee_details?: { percentage_fee?: number; fixed_fee?: number; gross_amount?: number };
}

const NOMBRES_PUBLICACION: Record<string, string> = { gold_special: "Clásica", gold_pro: "Premium" };

/** Comisión de Mercado Libre para un precio y categoría, en Clásica y
 * Premium. Usa `/sites/MLM/listing_prices`, que es lo mismo que consulta el
 * simulador oficial. */
export async function comisionesMercadoLibre(precio: number, categoriaId: string): Promise<ComisionMl[]> {
  const params = new URLSearchParams({ price: String(precio), category_id: categoriaId });
  const respuesta = await mercadolibreGet<ListingPriceApi[] | ListingPriceApi>(`/sites/MLM/listing_prices?${params}`);
  const lista = Array.isArray(respuesta) ? respuesta : [respuesta];
  return lista
    .filter((l) => l.listing_type_id === "gold_special" || l.listing_type_id === "gold_pro")
    .map((l) => ({
      tipoPublicacion: l.listing_type_id,
      nombre: NOMBRES_PUBLICACION[l.listing_type_id] ?? l.listing_type_name ?? l.listing_type_id,
      monto: l.sale_fee_amount ?? 0,
      porcentaje: l.sale_fee_details?.percentage_fee ?? null,
      fijo: l.sale_fee_details?.fixed_fee ?? null,
    }))
    .sort((a) => (a.tipoPublicacion === "gold_special" ? -1 : 1));
}

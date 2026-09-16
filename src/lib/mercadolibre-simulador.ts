// Simulador de costos de Mercado Libre con datos REALES de su API (en vez
// de que Isaac copie a mano del simulador de la página de Mercado Libre):
// comisión por venta según categoría/precio/tipo de publicación, y costo de
// envío según medidas/peso/precio.

import { mercadolibreGet, obtenerConexion } from "@/lib/mercadolibre-auth";
import { costoEnvioMercadoLibre } from "@/lib/costos-envio-ml";

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

export interface EnvioMl {
  monto: number;
  /** "api" = lo dijo Mercado Libre para la cuenta de Isaac; "tabla" = la
   * tabla oficial que tenemos guardada (respaldo si la API no contesta). */
  fuente: "api" | "tabla";
  pesoFacturableKg: number | null;
}

/** Costo de envío (con envío gratis, el que paga el vendedor) para UNA
 * pieza. Primero se le pregunta a Mercado Libre con las medidas y precio;
 * si no responde, se usa la tabla oficial guardada en el sistema. */
export async function envioMercadoLibre(datos: {
  precio: number;
  largoCm: number;
  anchoCm: number;
  altoCm: number;
  pesoKg: number | null;
}): Promise<EnvioMl> {
  const respaldo = (): EnvioMl => ({
    monto: costoEnvioMercadoLibre({
      pesoFisicoKg: datos.pesoKg,
      largoCm: datos.largoCm,
      anchoCm: datos.anchoCm,
      altoCm: datos.altoCm,
      precioVenta: datos.precio,
      envioGratis: true,
    }),
    fuente: "tabla",
    pesoFacturableKg: null,
  });

  const conexion = await obtenerConexion();
  if (!conexion || !datos.largoCm || !datos.anchoCm || !datos.altoCm) return respaldo();

  const gramos = Math.max(1, Math.round((datos.pesoKg ?? 0) * 1000));
  const dimensiones = `${Math.ceil(datos.largoCm)}x${Math.ceil(datos.anchoCm)}x${Math.ceil(datos.altoCm)},${gramos}`;
  try {
    const params = new URLSearchParams({ dimensions: dimensiones, item_price: String(datos.precio), verbose: "true" });
    const r = await mercadolibreGet<{
      coverage?: { all_country?: { list_cost?: number; billable_weight?: number } };
    }>(`/users/${conexion.ml_user_id}/shipping_options/free?${params}`);
    const costo = r.coverage?.all_country?.list_cost;
    if (typeof costo !== "number") return respaldo();
    const peso = r.coverage?.all_country?.billable_weight;
    return { monto: costo, fuente: "api", pesoFacturableKg: typeof peso === "number" ? peso / 1000 : null };
  } catch {
    return respaldo();
  }
}

/** Categoría y precio de un anuncio, a partir de su link o ID, para
 * precargar el simulador con un producto parecido al que Isaac quiere vender. */
export async function categoriaDeItem(itemId: string) {
  const item = await mercadolibreGet<{ category_id?: string; price?: number; title?: string }>(`/items/${itemId}?attributes=category_id,price,title`);
  let nombre: string | null = null;
  if (item.category_id) {
    try {
      const cat = await mercadolibreGet<{ name?: string; path_from_root?: { name: string }[] }>(`/categories/${item.category_id}`);
      nombre = cat.path_from_root?.map((c) => c.name).join(" › ") ?? cat.name ?? null;
    } catch {
      nombre = null;
    }
  }
  return { categoriaId: item.category_id ?? null, categoriaNombre: nombre, precio: item.price ?? null, titulo: item.title ?? null };
}

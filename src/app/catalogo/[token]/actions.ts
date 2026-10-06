"use server";

import { revalidatePath } from "next/cache";
import { fijarPrecioVendedorPorToken } from "@/lib/catalogo-vendedores";

/** El vendedor sube (o regresa al mínimo) su precio de un producto desde su
 * link privado. Sin sesión: la llave es su token. */
export async function fijarPrecioVendedor(token: string, sku: string, precio: number | null) {
  const r = await fijarPrecioVendedorPorToken(token, sku, precio);
  if (!r.error) revalidatePath(`/catalogo/${token}`);
  return r;
}

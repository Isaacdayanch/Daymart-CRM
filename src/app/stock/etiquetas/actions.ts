"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sinColumnasFaltantes } from "@/lib/columnas-faltantes";
import { sePuedeCodificar } from "@/lib/codigo-barras";

/** Guarda a mano el Código ML (de Full) de un producto para su etiqueta: en
 * la ficha del catálogo y en todos los productos de contenedor con ese SKU.
 * Vacío = se quita (y vuelve a tomarse de Mercado Libre si está ligado). */
export async function guardarCodigoMl(sku: string, codigo: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const limpio = codigo.trim().toUpperCase() || null;
  if (limpio && !sePuedeCodificar(limpio)) return { error: "El código solo puede traer letras y números (sin acentos ni espacios raros)." };

  const r1 = await sinColumnasFaltantes({ codigo_ml: limpio, actualizado_en: new Date().toISOString() }, (f) => supabase.from("productos_catalogo").update(f).eq("sku", sku));
  if (r1.omitidas.includes("codigo_ml")) return { error: "Falta correr el SQL 0054 en Supabase para guardar códigos ML." };
  if (r1.error) return { error: r1.error };
  const r2 = await sinColumnasFaltantes({ codigo_ml: limpio }, (f) => supabase.from("productos").update(f).eq("sku", sku));
  if (r2.error) return { error: r2.error };

  revalidatePath("/stock/etiquetas");
  revalidatePath("/stock/catalogo");
  revalidatePath(`/stock/producto/${encodeURIComponent(sku)}`);
  return { error: null };
}

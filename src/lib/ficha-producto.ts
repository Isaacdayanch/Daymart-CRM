// Campos "físicos" y de precio de la ficha de un producto (piezas por caja,
// medidas de la caja de importación, peso por pieza, precio mínimo de venta)
// — compartidos por "Editar producto →" en la ficha de Stock y por "editar"
// en Stock → Catálogo, para que los dos guarden exactamente lo mismo.
//
// Isaac (16 oct): "¿y en dónde corrijo las medidas y el precio?" — antes las
// medidas solo se podían corregir producto por producto dentro de cada
// contenedor, y el precio solo en Vendedores → Lista de precios.
//
// Dónde se guarda cada cosa:
// - Catálogo (`productos_catalogo`): todo (es la ficha).
// - Productos de contenedores TODAVÍA NO recibidos: piezas por caja, medidas y
//   peso (así el CBM y el peso del contenedor que se está armando salen bien).
//   Los contenedores ya recibidos NO se tocan: cambiarles las medidas movería
//   el costo por pieza de mercancía que ya entró a stock.
// - Movimientos de stock: piezas por caja (para la columna de cajas).

import type { SupabaseClient } from "@supabase/supabase-js";
import { guardarEnCatalogo } from "./catalogo";

export interface CamposFicha {
  piezasPorCaja?: number;
  largo?: number;
  ancho?: number;
  alto?: number;
  peso?: number;
  /** undefined = el formulario no traía el campo; null = sin precio. */
  precioVenta?: number | null;
}

function numeroOpcional(formData: FormData, campo: string): number | undefined {
  const v = formData.get(campo);
  if (typeof v !== "string" || !v.trim()) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function camposFichaDeFormulario(formData: FormData): CamposFicha {
  const precioCrudo = formData.get("precio_venta");
  const traePrecio = typeof precioCrudo === "string";
  const precio = traePrecio ? Number(precioCrudo) : NaN;
  return {
    piezasPorCaja: numeroOpcional(formData, "piezas_por_caja"),
    largo: numeroOpcional(formData, "largo_cm"),
    ancho: numeroOpcional(formData, "ancho_cm"),
    alto: numeroOpcional(formData, "alto_cm"),
    peso: numeroOpcional(formData, "peso_kg"),
    precioVenta: !traePrecio ? undefined : Number.isFinite(precio) && precio > 0 ? precio : null,
  };
}

/** Guarda los campos de la ficha en el catálogo y los propaga a donde
 * aplica. Nunca truena: devuelve avisos en lenguaje de Isaac. */
export async function guardarCamposFicha(supabase: SupabaseClient, sku: string, nombre: string, campos: CamposFicha): Promise<{ avisos: string[] }> {
  const avisos: string[] = [];

  const r = await guardarEnCatalogo(supabase, {
    sku,
    nombre,
    piezas_por_caja: campos.piezasPorCaja,
    largo_cm: campos.largo,
    ancho_cm: campos.ancho,
    alto_cm: campos.alto,
    peso_kg: campos.peso,
  });
  if (r.error && !/does not exist|schema cache/i.test(r.error)) avisos.push(`La ficha del catálogo no se pudo actualizar: ${r.error}`);

  if (campos.precioVenta !== undefined) {
    const { error } = await supabase.from("productos_catalogo").update({ precio_venta: campos.precioVenta, actualizado_en: new Date().toISOString() }).eq("sku", sku);
    if (error && /precio_venta/.test(error.message)) avisos.push("El precio no se guardó: falta correr el SQL 0044 en Supabase.");
    else if (error && !/does not exist|schema cache/i.test(error.message)) avisos.push(`El precio no se guardó: ${error.message}`);
  }

  // Contenedores que todavía no se reciben: ahí sí importa la caja real.
  const cambiosProducto: Record<string, unknown> = {};
  if (campos.piezasPorCaja && campos.piezasPorCaja > 0) cambiosProducto.piezas_por_caja = campos.piezasPorCaja;
  if (campos.largo) cambiosProducto.largo_cm = campos.largo;
  if (campos.ancho) cambiosProducto.ancho_cm = campos.ancho;
  if (campos.alto) cambiosProducto.alto_cm = campos.alto;
  if (campos.peso !== undefined) cambiosProducto.peso_kg = campos.peso > 0 ? campos.peso : null;
  if (Object.keys(cambiosProducto).length > 0) {
    const { data: vivos } = await supabase.from("contenedores").select("id").neq("estado", "RECIBIDO_BODEGA").is("eliminado_en", null);
    const ids = (vivos ?? []).map((c: { id: string }) => c.id);
    if (ids.length > 0) {
      let { error } = await supabase.from("productos").update(cambiosProducto).eq("sku", sku).in("contenedor_id", ids);
      if (error && /peso_kg/.test(error.message)) {
        delete cambiosProducto.peso_kg;
        ({ error } = await supabase.from("productos").update(cambiosProducto).eq("sku", sku).in("contenedor_id", ids));
      }
      if (error) avisos.push(`No se pudieron actualizar los contenedores en camino: ${error.message}`);
    }
  }

  if (campos.piezasPorCaja && campos.piezasPorCaja > 0) {
    await supabase.from("movimientos_stock").update({ piezas_por_caja: campos.piezasPorCaja }).eq("sku", sku);
  }

  return { avisos };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { texto, numero } from "@/lib/form-helpers";
import { obtenerDatosMercadoLibre } from "@/lib/mercadolibre";
import { costoEnvioMercadoLibre } from "@/lib/costos-envio-ml";
import { costoEstimadoPorPiezaResearch, margenEstimadoResearch } from "@/lib/calculos-research";
import { skuSugerido } from "@/lib/calculos";

/** Trae foto/precio/categoría/ventas del link de Mercado Libre. No guarda
 * nada — solo regresa los datos para llenar el formulario; si falla, la
 * pantalla se queda usable para llenar todo a mano. */
export async function traerDatosMercadoLibre(link: string) {
  return obtenerDatosMercadoLibre(link);
}

/** Guarda una investigación como borrador. El costo, el envío y el margen
 * se calculan aquí (con los mismos datos que ya se veían en vivo en la
 * pantalla) y se guardan como foto del momento — así el borrador no
 * cambia si después se ajusta algo general del sistema. */
export async function guardarBorrador(formData: FormData) {
  const supabase = await createClient();

  const nombre = texto(formData, "nombre");
  if (!nombre) return { error: "Falta el nombre del producto." };

  const largoCm = numero(formData, "largo_cm");
  const anchoCm = numero(formData, "ancho_cm");
  const altoCm = numero(formData, "alto_cm");
  const piezasPorCaja = numero(formData, "piezas_por_caja") || 1;
  const costoPorCbmPesos = numero(formData, "costo_por_cbm_pesos");
  const precioCompraDolares = numero(formData, "precio_compra_dolares");
  const tipoCambioEstimado = numero(formData, "tipo_cambio_estimado");

  const paqueteLargoCm = numero(formData, "paquete_largo_cm");
  const paqueteAnchoCm = numero(formData, "paquete_ancho_cm");
  const paqueteAltoCm = numero(formData, "paquete_alto_cm");
  const paquetePesoFisicoCampo = formData.get("paquete_peso_fisico_kg");
  const paquetePesoFisicoKg =
    typeof paquetePesoFisicoCampo === "string" && paquetePesoFisicoCampo ? Number(paquetePesoFisicoCampo) : null;

  const precioVenta = numero(formData, "precio_venta");
  const comisionMlPct = numero(formData, "comision_ml_pct");
  const envioGratis = formData.get("envio_gratis") === "true";

  const costoEnvioManual = formData.get("costo_envio_pesos");
  const costoEnvioPesos =
    typeof costoEnvioManual === "string" && costoEnvioManual
      ? Number(costoEnvioManual)
      : costoEnvioMercadoLibre({
          pesoFisicoKg: paquetePesoFisicoKg,
          largoCm: paqueteLargoCm,
          anchoCm: paqueteAnchoCm,
          altoCm: paqueteAltoCm,
          precioVenta,
          envioGratis,
        });

  const costoEstimadoPiezaPesos = costoEstimadoPorPiezaResearch({
    largoCm,
    anchoCm,
    altoCm,
    piezasPorCaja,
    costoPorCbmPesos,
    precioCompraDolares,
    tipoCambioEstimado,
  });

  const { margenPesos, margenPct } = margenEstimadoResearch({
    precioVenta,
    comisionMlPct,
    costoEnvioPesos,
    costoEstimadoPiezaPesos,
  });

  const { error } = await supabase.from("research_productos").insert({
    link_mercado_libre: texto(formData, "link_mercado_libre"),
    nombre,
    imagen_url: texto(formData, "imagen_url"),
    categoria_ml_id: texto(formData, "categoria_ml_id"),
    categoria_ml_nombre: texto(formData, "categoria_ml_nombre"),
    precio_referencia_ml: numero(formData, "precio_referencia_ml"),
    ventas_ml: formData.get("ventas_ml") ? numero(formData, "ventas_ml") : null,
    precio_venta: precioVenta,
    precio_compra_dolares: precioCompraDolares,
    tipo_cambio_estimado: tipoCambioEstimado,
    piezas_por_caja: piezasPorCaja,
    largo_cm: largoCm,
    ancho_cm: anchoCm,
    alto_cm: altoCm,
    costo_por_cbm_pesos: costoPorCbmPesos,
    paquete_largo_cm: paqueteLargoCm,
    paquete_ancho_cm: paqueteAnchoCm,
    paquete_alto_cm: paqueteAltoCm,
    paquete_peso_fisico_kg: paquetePesoFisicoKg,
    comision_ml_pct: comisionMlPct,
    envio_gratis: envioGratis,
    costo_envio_pesos: costoEnvioPesos,
    costo_estimado_pieza_pesos: costoEstimadoPiezaPesos,
    margen_estimado_pesos: margenPesos,
    margen_estimado_pct: margenPct,
    notas: texto(formData, "notas"),
  });
  if (error) return { error: error.message };

  revalidatePath("/research");
  return { error: null };
}

/** Solo se puede borrar un borrador que sigue como borrador — uno ya
 * convertido está ligado a un producto real de un contenedor. */
export async function eliminarBorrador(borradorId: string) {
  const supabase = await createClient();
  await supabase.from("research_productos").delete().eq("id", borradorId).eq("estado", "BORRADOR");
  revalidatePath("/research");
}

export async function descartarBorrador(borradorId: string) {
  const supabase = await createClient();
  await supabase
    .from("research_productos")
    .update({ estado: "DESCARTADO", actualizado_en: new Date().toISOString() })
    .eq("id", borradorId)
    .eq("estado", "BORRADOR");
  revalidatePath("/research");
}

/** Convierte un borrador en un producto real dentro de un contenedor —
 * mismo patrón que "agregarProducto" en Contenedores, nada más que
 * partiendo de los datos ya capturados en la investigación en vez de un
 * formulario nuevo desde cero. */
export async function convertirEnProducto(borradorId: string, formData: FormData) {
  const supabase = await createClient();

  const { data: borrador } = await supabase
    .from("research_productos")
    .select("*")
    .eq("id", borradorId)
    .maybeSingle();
  if (!borrador) return { error: "No se encontró la investigación." };

  const contenedorId = formData.get("contenedor_id") as string;
  if (!contenedorId) return { error: "Elige a qué contenedor va." };

  const categoria = texto(formData, "categoria") ?? borrador.categoria_ml_nombre ?? "General";
  const cantidad = numero(formData, "cantidad");
  const sku = skuSugerido(categoria, borrador.nombre);

  const { data: ultimo } = await supabase
    .from("productos")
    .select("orden")
    .eq("contenedor_id", contenedorId)
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error: errorProducto } = await supabase.from("productos").insert({
    contenedor_id: contenedorId,
    categoria,
    fabrica: texto(formData, "fabrica"),
    proveedor: texto(formData, "proveedor"),
    imagen_url: borrador.imagen_url,
    sku,
    nombre: borrador.nombre,
    memo: texto(formData, "memo"),
    cantidad,
    precio_dolares: borrador.precio_compra_dolares,
    piezas_por_caja: borrador.piezas_por_caja,
    largo_cm: borrador.largo_cm,
    ancho_cm: borrador.ancho_cm,
    alto_cm: borrador.alto_cm,
    orden: (ultimo?.orden ?? 0) + 1,
  });
  if (errorProducto) return { error: errorProducto.message };

  const { error: errorBorrador } = await supabase
    .from("research_productos")
    .update({ estado: "CONVERTIDO", contenedor_asignado_id: contenedorId, actualizado_en: new Date().toISOString() })
    .eq("id", borradorId);
  if (errorBorrador) {
    return { error: `El producto se creó en el contenedor, pero no se pudo marcar el borrador: ${errorBorrador.message}` };
  }

  revalidatePath("/research");
  revalidatePath(`/contenedores/${contenedorId}`);
  return { error: null };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { texto } from "@/lib/form-helpers";
import { costoPromedioPonderado } from "@/lib/calculos-stock";
import type { MovimientoStock } from "@/lib/tipos";

export async function agregarBodega(formData: FormData) {
  const supabase = await createClient();
  const nombre = texto(formData, "nombre");
  if (!nombre) return;
  await supabase.from("bodegas").insert({ nombre });
  revalidatePath("/stock/bodegas");
  revalidatePath("/contenedores");
}

export async function eliminarBodega(bodegaId: string) {
  const supabase = await createClient();
  await supabase.from("bodegas").update({ eliminado_en: new Date().toISOString() }).eq("id", bodegaId);
  revalidatePath("/stock/bodegas");
}

interface LineaSalida {
  sku: string;
  nombre: string;
  cantidad: number;
  piezasPorCaja: number;
  imagenUrl: string | null;
  categoria: string;
  colorFull: string | null;
  notas: string | null;
}

/** Registra varias salidas (o devoluciones) de una sola vez — Isaac arma la
 * lista en pantalla ("salió esto, salió esto...") y aquí se guardan todas
 * juntas. "Devolución" es especial: en vez de restar, SUMA al stock (es
 * mercancía que regresa), guardada como un ajuste positivo. */
export async function registrarSalidasLote(formData: FormData) {
  const supabase = await createClient();

  const bodegaId = formData.get("bodega_id") as string;
  const lineasCrudo = formData.get("lineas");
  if (!bodegaId || typeof lineasCrudo !== "string") {
    return { error: "Falta la bodega o las líneas a registrar." };
  }

  let lineas: LineaSalida[];
  try {
    lineas = JSON.parse(lineasCrudo);
  } catch {
    return { error: "No se pudieron leer las líneas." };
  }
  if (!Array.isArray(lineas) || lineas.length === 0) {
    return { error: "Agrega al menos una línea antes de registrar." };
  }

  // Para las devoluciones necesitamos un costo por pieza razonable (para que
  // el valor de inventario no se distorsione): se usa el costo promedio
  // actual de cada SKU.
  const skusDevolucion = Array.from(
    new Set(lineas.filter((l) => l.categoria === "Devolución").map((l) => l.sku)),
  );
  const costoPorSku = new Map<string, number>();
  if (skusDevolucion.length) {
    const { data: movimientosSkus } = await supabase
      .from("movimientos_stock")
      .select("*")
      .in("sku", skusDevolucion)
      .returns<MovimientoStock[]>();
    for (const sku of skusDevolucion) {
      const movs = (movimientosSkus ?? []).filter((m) => m.sku === sku);
      costoPorSku.set(sku, costoPromedioPonderado(movs));
    }
  }

  const movimientos = lineas.map((linea) => {
    const esDevolucion = linea.categoria === "Devolución";
    const referencia =
      linea.categoria === "Full" && linea.colorFull
        ? `Full ${linea.colorFull}${linea.notas ? ` — ${linea.notas}` : ""}`
        : linea.notas || null;

    return {
      tipo: esDevolucion ? "AJUSTE" : "SALIDA",
      sku: linea.sku,
      nombre: linea.nombre,
      bodega_id: bodegaId,
      cantidad: linea.cantidad,
      piezas_por_caja: linea.piezasPorCaja || 1,
      imagen_url: linea.imagenUrl,
      costo_unitario_pesos: esDevolucion ? (costoPorSku.get(linea.sku) ?? 0) : 0,
      destino: linea.categoria,
      referencia,
    };
  });

  const { error } = await supabase.from("movimientos_stock").insert(movimientos);
  if (error) return { error: error.message };

  revalidatePath("/stock");
  revalidatePath("/stock/movimientos");
  return { error: null };
}

/** Da de alta stock que ya existe físicamente pero no pasó por el flujo
 * normal de "recibir contenedor" — pensado para cargar de una vez el
 * inventario de contenedores anteriores sin tener que recrearlos completos. */
export async function agregarStockManual(formData: FormData) {
  const supabase = await createClient();

  const sku = texto(formData, "sku");
  const nombre = texto(formData, "nombre");
  const bodegaId = formData.get("bodega_id") as string;
  const cantidad = Number(formData.get("cantidad")) || 0;
  if (!sku || !nombre || !bodegaId || cantidad <= 0) {
    return { error: "Falta el SKU, el nombre, la bodega o la cantidad." };
  }

  await supabase.from("movimientos_stock").insert({
    tipo: "ENTRADA",
    sku,
    nombre,
    bodega_id: bodegaId,
    cantidad,
    piezas_por_caja: Number(formData.get("piezas_por_caja")) || 1,
    imagen_url: texto(formData, "imagen_url"),
    costo_unitario_pesos: Number(formData.get("costo_unitario_pesos")) || 0,
    referencia: texto(formData, "referencia") ?? "Carga manual de stock existente",
  });

  revalidatePath("/stock");
  revalidatePath("/stock/movimientos");
  return { error: null };
}

export async function actualizarDiasEspera(formData: FormData) {
  const supabase = await createClient();
  const diasEspera = Number(formData.get("dias_espera")) || 60;
  await supabase.from("configuracion_stock").upsert({ id: 1, dias_espera: diasEspera });
  revalidatePath("/stock");
}

export async function marcarPagadoPendiente(pendienteId: string, pagado: boolean) {
  const supabase = await createClient();
  await supabase
    .from("pendientes_china")
    .update({ pagado, actualizado_en: new Date().toISOString() })
    .eq("id", pendienteId);
  revalidatePath("/stock/pendientes");
}

export async function cancelarPendiente(pendienteId: string) {
  const supabase = await createClient();
  await supabase
    .from("pendientes_china")
    .update({ estado: "CANCELADA", actualizado_en: new Date().toISOString() })
    .eq("id", pendienteId);
  revalidatePath("/stock/pendientes");
}

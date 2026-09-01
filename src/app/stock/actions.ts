"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nombreArchivoSeguro, texto } from "@/lib/form-helpers";
import { completarColumnasOmitidas, insertarMovimientosStock } from "@/lib/movimientos-stock";
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

  // Por defecto es "ahora", pero se puede registrar una salida con fecha
  // pasada (ej. cargar el lunes las ventas del fin de semana) sin que eso
  // descuadre la rotación real de cada producto.
  const fechaCampo = formData.get("fecha");
  const fecha =
    typeof fechaCampo === "string" && fechaCampo
      ? new Date(`${fechaCampo}T12:00:00`).toISOString()
      : new Date().toISOString();

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
      creado_en: fecha,
    };
  });

  const { data: insertados, error, columnasOmitidas } = await insertarMovimientosStock(supabase, movimientos);
  if (error) return { error };
  if (insertados && columnasOmitidas.length) {
    await completarColumnasOmitidas(supabase, insertados.map((i) => i.id), movimientos, columnasOmitidas);
  }

  revalidatePath("/stock");
  revalidatePath("/stock/movimientos");
  return { error: null };
}

async function subirImagenStock(
  supabase: Awaited<ReturnType<typeof createClient>>,
  formData: FormData,
): Promise<{ url: string | null; error: string | null }> {
  const imagen = formData.get("imagen");
  if (!(imagen instanceof File) || imagen.size === 0) return { url: null, error: null };

  const ruta = `stock-manual/${crypto.randomUUID()}-${nombreArchivoSeguro(imagen.name)}`;
  const { error } = await supabase.storage.from("productos").upload(ruta, imagen);
  if (error) return { url: null, error: error.message };

  const url = supabase.storage.from("productos").getPublicUrl(ruta).data.publicUrl;
  return { url, error: null };
}

/** Da de alta stock que ya existe físicamente pero no pasó por el flujo
 * normal de "recibir contenedor" — pensado para cargar de una vez el
 * inventario de contenedores anteriores sin tener que recrearlos completos,
 * o para mercancía que nunca llegó en un contenedor formal. */
export async function agregarStockManual(formData: FormData) {
  const supabase = await createClient();

  const sku = texto(formData, "sku");
  const nombre = texto(formData, "nombre");
  const bodegaId = formData.get("bodega_id") as string;
  const cantidad = Number(formData.get("cantidad")) || 0;
  if (!sku || !nombre || !bodegaId || cantidad <= 0) {
    return { error: "Falta el SKU, el nombre, la bodega o la cantidad." };
  }

  const { url: imagenSubida, error: errorImagen } = await subirImagenStock(supabase, formData);
  const imagenUrl = imagenSubida ?? texto(formData, "imagen_url_previa");

  const fila = {
    tipo: "ENTRADA",
    sku,
    nombre,
    bodega_id: bodegaId,
    cantidad,
    piezas_por_caja: Number(formData.get("piezas_por_caja")) || 1,
    imagen_url: imagenUrl,
    costo_unitario_pesos: Number(formData.get("costo_unitario_pesos")) || 0,
    referencia: texto(formData, "referencia") ?? "Carga manual de stock existente",
  };
  const { data: insertados, error: errorInsert, columnasOmitidas } = await insertarMovimientosStock(supabase, [
    fila,
  ]);
  if (errorInsert) return { error: `No se pudo guardar: ${errorInsert}` };
  if (insertados && columnasOmitidas.length) {
    await completarColumnasOmitidas(supabase, insertados.map((i) => i.id), [fila], columnasOmitidas);
  }

  revalidatePath("/stock");
  revalidatePath("/stock/movimientos");
  return { error: errorImagen ? `La foto no se pudo subir: ${errorImagen}` : null };
}

interface LineaCargaMasiva {
  sku: string;
  nombre: string;
  cantidad: number;
  costoUnitarioPesos: number;
  piezasPorCaja: number;
}

/** Carga de golpe el stock que Isaac ya tiene (de su Excel), sin pasar por
 * contenedores ni reconstruir su historial — cada línea entra como una
 * ENTRADA de hoy con el SKU definitivo que él quiera usar de ahora en
 * adelante (no necesita coincidir con nada anterior). */
export async function agregarStockManualLote(formData: FormData) {
  const supabase = await createClient();

  const bodegaId = formData.get("bodega_id") as string;
  const lineasCrudo = formData.get("lineas");
  if (!bodegaId || typeof lineasCrudo !== "string") {
    return { error: "Falta la bodega o las líneas a cargar." };
  }

  let lineas: LineaCargaMasiva[];
  try {
    lineas = JSON.parse(lineasCrudo);
  } catch {
    return { error: "No se pudieron leer las líneas." };
  }
  if (!Array.isArray(lineas) || lineas.length === 0) {
    return { error: "Agrega al menos una línea antes de guardar." };
  }

  const movimientos = lineas.map((linea) => ({
    tipo: "ENTRADA",
    sku: linea.sku,
    nombre: linea.nombre,
    bodega_id: bodegaId,
    cantidad: linea.cantidad,
    piezas_por_caja: linea.piezasPorCaja || 1,
    imagen_url: null,
    costo_unitario_pesos: linea.costoUnitarioPesos || 0,
    referencia: "Carga inicial de inventario",
  }));

  const { data: insertados, error, columnasOmitidas } = await insertarMovimientosStock(supabase, movimientos);
  if (error) return { error };
  if (insertados && columnasOmitidas.length) {
    await completarColumnasOmitidas(supabase, insertados.map((i) => i.id), movimientos, columnasOmitidas);
  }

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

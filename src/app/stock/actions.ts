"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nombreArchivoSeguro, texto } from "@/lib/form-helpers";
import { completarColumnasOmitidas, insertarMovimientosStock } from "@/lib/movimientos-stock";
import { costoPromedioPonderado, stockActual } from "@/lib/calculos-stock";
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

interface LineaConteo {
  sku: string;
  nombre: string;
  piezasPorCaja: number;
  imagenUrl: string | null;
  cantidadSistema: number;
  cantidadReal: number;
}

/** "Revisar inventario" con conteo físico: solo se guardan las líneas que
 * de verdad se revisaron y no cuadraban — el resto (revisado pero igual, o
 * ni siquiera revisado) no genera ningún movimiento. Queda como AJUSTE,
 * igual que una corrección de conteo al recibir un contenedor. */
export async function registrarConteoFisico(formData: FormData) {
  const supabase = await createClient();

  const bodegaId = formData.get("bodega_id") as string;
  const lineasCrudo = formData.get("lineas");
  if (!bodegaId || typeof lineasCrudo !== "string") {
    return { error: "Falta la bodega o las líneas revisadas." };
  }

  let lineas: LineaConteo[];
  try {
    lineas = JSON.parse(lineasCrudo);
  } catch {
    return { error: "No se pudieron leer las líneas." };
  }

  const conDiferencia = lineas.filter((l) => l.cantidadReal !== l.cantidadSistema);
  if (conDiferencia.length === 0) {
    return { error: "No marcaste ninguna diferencia que ajustar." };
  }

  const skus = Array.from(new Set(conDiferencia.map((l) => l.sku)));
  const { data: movimientosSkus } = await supabase
    .from("movimientos_stock")
    .select("*")
    .in("sku", skus)
    .returns<MovimientoStock[]>();
  const costoPorSku = new Map<string, number>();
  for (const sku of skus) {
    const movs = (movimientosSkus ?? []).filter((m) => m.sku === sku);
    costoPorSku.set(sku, costoPromedioPonderado(movs));
  }

  const movimientos = conDiferencia.map((l) => ({
    tipo: "AJUSTE",
    sku: l.sku,
    nombre: l.nombre,
    bodega_id: bodegaId,
    cantidad: l.cantidadReal - l.cantidadSistema,
    piezas_por_caja: l.piezasPorCaja || 1,
    imagen_url: l.imagenUrl,
    costo_unitario_pesos: costoPorSku.get(l.sku) ?? 0,
    referencia: "Ajuste por conteo físico (Revisar inventario)",
  }));

  const { data: insertados, error, columnasOmitidas } = await insertarMovimientosStock(supabase, movimientos);
  if (error) return { error };
  if (insertados && columnasOmitidas.length) {
    await completarColumnasOmitidas(supabase, insertados.map((i) => i.id), movimientos, columnasOmitidas);
  }

  revalidatePath("/stock");
  revalidatePath("/stock/movimientos");
  return { error: null, ajustados: conDiferencia.length };
}

/** Corrige rápido la cantidad real de un SKU en una bodega, desde la ficha
 * del producto — sin tener que pasar por "Revisar inventario" completo. Si
 * la cantidad baja, el que llama ya decidió el motivo (lo pregunta la
 * pantalla antes de mandar esto): "SALIDA" cuenta como venta/envío real
 * (afecta la rotación), "AJUSTE" es una corrección que no cuenta como venta
 * (ej. el contenedor llegó con menos de lo registrado, o un error de
 * conteo). Si sube, siempre es AJUSTE (se encontró más stock del que había
 * registrado). */
export async function corregirCantidadStock(formData: FormData) {
  const supabase = await createClient();

  const sku = texto(formData, "sku");
  const nombre = texto(formData, "nombre");
  const bodegaId = formData.get("bodega_id") as string;
  const cantidadNueva = Number(formData.get("cantidad_nueva"));
  const motivo = (formData.get("motivo") as string) || "AJUSTE";
  const piezasPorCaja = Number(formData.get("piezas_por_caja")) || 1;
  const imagenUrl = texto(formData, "imagen_url");

  if (!sku || !nombre || !bodegaId || !Number.isFinite(cantidadNueva) || cantidadNueva < 0) {
    return { error: "Falta el SKU, la bodega, o la cantidad no es válida." };
  }

  const { data: movimientosSku } = await supabase
    .from("movimientos_stock")
    .select("*")
    .eq("sku", sku)
    .returns<MovimientoStock[]>();
  const movs = movimientosSku ?? [];
  const cantidadActual = stockActual(movs.filter((m) => m.bodega_id === bodegaId));
  const diferencia = cantidadNueva - cantidadActual;

  if (diferencia === 0) return { error: "Esa ya es la cantidad actual — no hay nada que corregir." };

  const esSalida = diferencia < 0 && motivo === "SALIDA";
  const fila = {
    tipo: esSalida ? "SALIDA" : "AJUSTE",
    sku,
    nombre,
    bodega_id: bodegaId,
    cantidad: esSalida ? Math.abs(diferencia) : diferencia,
    piezas_por_caja: piezasPorCaja,
    imagen_url: imagenUrl || null,
    costo_unitario_pesos: esSalida ? 0 : costoPromedioPonderado(movs),
    destino: esSalida ? "Salida rápida" : null,
    referencia: esSalida
      ? "Corregir cantidad — salida"
      : diferencia < 0
        ? "Corregir cantidad — ajuste (ej. el contenedor llegó con menos)"
        : "Corregir cantidad — se encontró más stock",
  };

  const { data: insertados, error, columnasOmitidas } = await insertarMovimientosStock(supabase, [fila]);
  if (error) return { error };
  if (insertados && columnasOmitidas.length) {
    await completarColumnasOmitidas(supabase, insertados.map((i) => i.id), [fila], columnasOmitidas);
  }

  revalidatePath("/stock");
  revalidatePath("/stock/movimientos");
  revalidatePath(`/stock/producto/${encodeURIComponent(sku)}`);
  return { error: null };
}

/** Edita los datos de un producto desde Stock (no hace falta entrar a cada
 * contenedor) y lo aplica a TODOS los productos y movimientos que tengan
 * ese SKU — así, si lo trajiste en el contenedor 10, 12 y 13, se corrige
 * en los tres de un jalón y queda consistente en Stock. */
export async function actualizarProductoGlobal(skuActual: string, formData: FormData) {
  const supabase = await createClient();

  const nombre = texto(formData, "nombre") ?? "";
  const skuNuevo = texto(formData, "sku") ?? skuActual;
  const categoria = texto(formData, "categoria");
  const fabrica = texto(formData, "fabrica");
  const proveedor = texto(formData, "proveedor");
  const piezasPorCaja = Number(formData.get("piezas_por_caja")) || 1;

  if (!nombre || !skuNuevo) return { error: "Falta el SKU o el nombre." };

  const { url: imagenSubida, error: errorImagen } = await subirImagenStock(supabase, formData);

  const { data: afectados } = await supabase.from("productos").select("contenedor_id").eq("sku", skuActual);

  const camposProducto: Record<string, unknown> = {
    sku: skuNuevo,
    nombre,
    categoria,
    fabrica,
    proveedor,
    piezas_por_caja: piezasPorCaja,
  };
  const camposMovimiento: Record<string, unknown> = { sku: skuNuevo, nombre, piezas_por_caja: piezasPorCaja };
  if (imagenSubida) {
    camposProducto.imagen_url = imagenSubida;
    camposMovimiento.imagen_url = imagenSubida;
  }

  const { error: errorProductos } = await supabase.from("productos").update(camposProducto).eq("sku", skuActual);
  if (errorProductos) return { error: errorProductos.message };

  const { error: errorMovimientos } = await supabase
    .from("movimientos_stock")
    .update(camposMovimiento)
    .eq("sku", skuActual);
  if (errorMovimientos) return { error: errorMovimientos.message };

  for (const p of afectados ?? []) {
    if (p.contenedor_id) revalidatePath(`/contenedores/${p.contenedor_id}`);
  }
  revalidatePath("/stock");
  revalidatePath("/stock/movimientos");
  revalidatePath(`/stock/producto/${encodeURIComponent(skuActual)}`);
  revalidatePath(`/stock/producto/${encodeURIComponent(skuNuevo)}`);

  return { error: errorImagen ? `La foto no se pudo subir: ${errorImagen}` : null, skuNuevo };
}

/** Corrige el costo de una entrada cargada a mano (ej. "Agregar stock
 * manual" con el costo en blanco/mal). Solo aplica a movimientos SIN
 * contenedor — los que sí vienen de un contenedor se corrigen desde ahí
 * con "Recalcular costo →", para no pisar ese mecanismo. */
export async function actualizarCostoManual(movimientoId: string, formData: FormData) {
  const supabase = await createClient();
  const costo = Number(formData.get("costo_unitario_pesos"));
  if (!Number.isFinite(costo) || costo < 0) return { error: "El costo no es válido." };

  const { data: movimiento } = await supabase
    .from("movimientos_stock")
    .select("sku, contenedor_id")
    .eq("id", movimientoId)
    .maybeSingle<{ sku: string; contenedor_id: string | null }>();
  if (!movimiento) return { error: "No se encontró el movimiento." };
  if (movimiento.contenedor_id) {
    return { error: "Esta entrada viene de un contenedor — corrígela desde ahí con \"Recalcular costo →\"." };
  }

  const { error } = await supabase
    .from("movimientos_stock")
    .update({ costo_unitario_pesos: costo })
    .eq("id", movimientoId);
  if (error) return { error: error.message };

  revalidatePath("/stock");
  revalidatePath("/stock/movimientos");
  revalidatePath(`/stock/producto/${encodeURIComponent(movimiento.sku)}`);
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

/** Un movimiento "suelto" es el que Isaac capturó a mano (salida, ajuste o
 * entrada manual): no viene de un contenedor ni de una venta. Solo esos se
 * pueden corregir/quitar aquí — los otros se corrigen desde su origen para
 * no desincronizar los dos registros del mismo dato. */
async function movimientoSuelto(supabase: Awaited<ReturnType<typeof createClient>>, movimientoId: string) {
  const { data } = await supabase
    .from("movimientos_stock")
    .select("*")
    .eq("id", movimientoId)
    .maybeSingle<MovimientoStock>();
  if (!data) return { movimiento: null, error: "No se encontró el movimiento." };
  if (data.contenedor_id) {
    return { movimiento: null, error: "Este movimiento viene de un contenedor — corrígelo desde el contenedor (Editar recepción)." };
  }
  if (data.venta_id) {
    return { movimiento: null, error: "Este movimiento viene de una venta — corrígelo o cancélalo desde Ventas." };
  }
  if (data.orden_ml_id || data.envio_full_id || data.recepcion_full_id) {
    return { movimiento: null, error: "Este movimiento lo generó Mercado Libre (venta o Full) — se atiende desde Stock → Full y ML." };
  }
  return { movimiento: data, error: null };
}

function refrescarStock(sku: string) {
  revalidatePath("/stock");
  revalidatePath("/stock/movimientos");
  revalidatePath(`/stock/producto/${encodeURIComponent(sku)}`);
  revalidatePath("/");
}

/** Corrige cantidad, fecha y nota de un movimiento suelto. */
export async function actualizarMovimientoStock(movimientoId: string, formData: FormData) {
  const supabase = await createClient();
  const { movimiento, error: errorSuelto } = await movimientoSuelto(supabase, movimientoId);
  if (!movimiento) return { error: errorSuelto };

  const cantidad = Number(formData.get("cantidad"));
  if (!Number.isFinite(cantidad) || cantidad === 0) return { error: "La cantidad no es válida." };
  if (movimiento.tipo !== "AJUSTE" && cantidad < 0) return { error: "La cantidad debe ser mayor a cero." };

  const fechaCampo = formData.get("fecha");
  const creadoEn =
    typeof fechaCampo === "string" && fechaCampo ? new Date(`${fechaCampo}T12:00:00`).toISOString() : movimiento.creado_en;

  const { error } = await supabase
    .from("movimientos_stock")
    .update({ cantidad, creado_en: creadoEn, referencia: texto(formData, "referencia") })
    .eq("id", movimientoId);
  if (error) return { error: error.message };

  refrescarStock(movimiento.sku);
  return { error: null };
}

/** Quita un movimiento suelto (ej. una salida que se capturó por error o que
 * después se registró como venta). No se permite si el stock del producto
 * quedaría en negativo. */
export async function eliminarMovimientoStock(movimientoId: string) {
  const supabase = await createClient();
  const { movimiento, error: errorSuelto } = await movimientoSuelto(supabase, movimientoId);
  if (!movimiento) return { error: errorSuelto };

  const { data: delSku } = await supabase
    .from("movimientos_stock")
    .select("*")
    .eq("sku", movimiento.sku)
    .returns<MovimientoStock[]>();
  const stockSinEste = stockActual((delSku ?? []).filter((m) => m.id !== movimientoId));
  if (stockSinEste < 0) {
    return { error: `Si quitas este movimiento, "${movimiento.nombre}" quedaría en ${stockSinEste} piezas (negativo).` };
  }

  const { error } = await supabase.from("movimientos_stock").delete().eq("id", movimientoId);
  if (error) return { error: error.message };

  refrescarStock(movimiento.sku);
  return { error: null };
}

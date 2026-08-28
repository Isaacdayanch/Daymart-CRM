"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  costoFinalPorPieza,
  costoPorCbmContenedor,
  skuSugerido,
  tipoCambioPromedioMercancia,
} from "@/lib/calculos";
import { nombreArchivoSeguro, numero, texto } from "@/lib/form-helpers";
import type { Contenedor, EstadoContenedor, PagoMercancia, Producto, TipoDocumento } from "@/lib/tipos";

/** Si el estado cambió, guarda el momento en el historial del contenedor.
 * Por defecto usa la fecha/hora actual, pero se puede pasar una fecha
 * explícita (ej. al recibir un contenedor histórico con fecha pasada). */
export async function registrarHistorialSiCambia(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contenedorId: string,
  estadoNuevo: EstadoContenedor,
  fecha?: string,
) {
  const { data: actual } = await supabase
    .from("contenedores")
    .select("estado")
    .eq("id", contenedorId)
    .single();

  if (actual?.estado !== estadoNuevo) {
    await supabase
      .from("historial_estados_contenedor")
      .insert({ contenedor_id: contenedorId, estado: estadoNuevo, ...(fecha ? { fecha } : {}) });
  }
}

/** El costo por pieza que entra a stock se calcula con el flete/aduana/
 * abonos que haya AL MOMENTO de recibir el contenedor. Si Isaac llena esos
 * gastos después (algo muy normal: la mercancía llega antes de que se
 * terminen de pagar/capturar), el costo que ya quedó guardado en las
 * entradas de stock se queda desactualizado — esto lo vuelve a calcular
 * con los datos actuales, sin duplicar ni mover cantidades. */
export async function recalcularCostoEntradasContenedor(
  contenedorId: string,
): Promise<{ actualizados: number; total: number; error: string | null }> {
  const supabase = await createClient();

  const [{ data: contenedor }, { data: productos }, { data: abonos }] = await Promise.all([
    supabase.from("contenedores").select("*").eq("id", contenedorId).single<Contenedor>(),
    supabase.from("productos").select("*").eq("contenedor_id", contenedorId).returns<Producto[]>(),
    supabase.from("pagos_mercancia").select("*").eq("contenedor_id", contenedorId).returns<PagoMercancia[]>(),
  ]);

  if (!contenedor) return { actualizados: 0, total: 0, error: "No se encontró el contenedor." };
  if (!contenedor.stock_generado_en) {
    return { actualizados: 0, total: 0, error: "Este contenedor todavía no se ha recibido a stock." };
  }
  if (!productos || productos.length === 0) {
    return { actualizados: 0, total: 0, error: null };
  }

  const costoPorCbm = costoPorCbmContenedor(contenedor, productos);
  const tipoCambioMercancia = tipoCambioPromedioMercancia(abonos ?? []);

  let actualizados = 0;
  for (const p of productos) {
    const costo = costoFinalPorPieza(p, costoPorCbm, tipoCambioMercancia);

    // Primero por producto_id (confiable). Si el movimiento es viejo y no
    // tiene producto_id guardado, se busca por SKU como respaldo — así no
    // se queda en $0 en silencio si el producto le cambiaste el SKU después.
    const porId = await supabase
      .from("movimientos_stock")
      .update({ costo_unitario_pesos: costo })
      .eq("contenedor_id", contenedorId)
      .eq("tipo", "ENTRADA")
      .eq("producto_id", p.id)
      .select("id");

    if (porId.data && porId.data.length > 0) {
      actualizados += porId.data.length;
      continue;
    }

    const porSku = await supabase
      .from("movimientos_stock")
      .update({ costo_unitario_pesos: costo, producto_id: p.id })
      .eq("contenedor_id", contenedorId)
      .eq("tipo", "ENTRADA")
      .is("producto_id", null)
      .eq("sku", p.sku)
      .select("id");

    actualizados += porSku.data?.length ?? 0;
  }

  revalidatePath(`/contenedores/${contenedorId}`);
  revalidatePath("/stock");
  revalidatePath("/stock/movimientos");
  return { actualizados, total: productos.length, error: null };
}

export async function actualizarContenedor(contenedorId: string, formData: FormData) {
  const supabase = await createClient();
  const estado = formData.get("estado") as EstadoContenedor;

  await registrarHistorialSiCambia(supabase, contenedorId, estado);

  await supabase
    .from("contenedores")
    .update({
      booking: texto(formData, "booking"),
      estado,
      flete_dolares: numero(formData, "flete_dolares"),
      flete_tipo_cambio: numero(formData, "flete_tipo_cambio"),
      aduana_pesos: numero(formData, "aduana_pesos"),
      otros_gastos_dolares: numero(formData, "otros_gastos_dolares"),
      otros_gastos_tipo_cambio: numero(formData, "otros_gastos_tipo_cambio"),
      fabrica_principal: texto(formData, "fabrica_principal"),
      proveedor_principal: texto(formData, "proveedor_principal"),
    })
    .eq("id", contenedorId);

  await recalcularCostoEntradasContenedor(contenedorId);
  revalidatePath(`/contenedores/${contenedorId}`);
}

export async function cambiarEstado(contenedorId: string, estado: EstadoContenedor) {
  const supabase = await createClient();
  await registrarHistorialSiCambia(supabase, contenedorId, estado);
  await supabase.from("contenedores").update({ estado }).eq("id", contenedorId);
  revalidatePath(`/contenedores/${contenedorId}`);
  revalidatePath("/");
}

/** Manda el contenedor a la papelera (no se borra de verdad, se puede restaurar). */
export async function eliminarContenedor(contenedorId: string) {
  const supabase = await createClient();
  await supabase
    .from("contenedores")
    .update({ eliminado_en: new Date().toISOString() })
    .eq("id", contenedorId);
  redirect("/");
}

export async function agregarAbono(contenedorId: string, formData: FormData) {
  const supabase = await createClient();

  const fecha = texto(formData, "fecha");

  await supabase.from("pagos_mercancia").insert({
    contenedor_id: contenedorId,
    monto_dolares: numero(formData, "monto_dolares"),
    tipo_cambio: numero(formData, "tipo_cambio"),
    pagado: formData.get("pagado") === "true",
    fecha: fecha ? new Date(`${fecha}T12:00:00`).toISOString() : new Date().toISOString(),
  });

  await recalcularCostoEntradasContenedor(contenedorId);
  revalidatePath(`/contenedores/${contenedorId}`);
}

export async function eliminarAbono(contenedorId: string, abonoId: string) {
  const supabase = await createClient();
  await supabase.from("pagos_mercancia").delete().eq("id", abonoId);
  await recalcularCostoEntradasContenedor(contenedorId);
  revalidatePath(`/contenedores/${contenedorId}`);
}

export async function actualizarFechaAbono(contenedorId: string, abonoId: string, formData: FormData) {
  const supabase = await createClient();
  const fecha = texto(formData, "fecha");
  if (!fecha) return;

  await supabase
    .from("pagos_mercancia")
    .update({ fecha: new Date(`${fecha}T12:00:00`).toISOString() })
    .eq("id", abonoId);

  revalidatePath(`/contenedores/${contenedorId}`);
}

async function subirImagenProducto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contenedorId: string,
  formData: FormData,
): Promise<{ url: string | null; error: string | null }> {
  const imagen = formData.get("imagen");
  if (!(imagen instanceof File) || imagen.size === 0) return { url: null, error: null };

  const ruta = `${contenedorId}/${crypto.randomUUID()}-${nombreArchivoSeguro(imagen.name)}`;
  const { error } = await supabase.storage.from("productos").upload(ruta, imagen);
  if (error) return { url: null, error: error.message };

  const url = supabase.storage.from("productos").getPublicUrl(ruta).data.publicUrl;
  return { url, error: null };
}

/** Si el producto se cargó desde "mercancía pendiente en China", descuenta o
 * cierra ese pendiente según cuánto se acaba de consolidar. */
async function resolverPendienteChinaSiAplica(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contenedorId: string,
  formData: FormData,
  cantidadAgregada: number,
) {
  const pendienteId = texto(formData, "pendiente_origen_id");
  if (!pendienteId) return;

  const { data: pendiente } = await supabase
    .from("pendientes_china")
    .select("cantidad_pendiente")
    .eq("id", pendienteId)
    .single();
  if (!pendiente) return;

  const restante = pendiente.cantidad_pendiente - cantidadAgregada;
  if (restante <= 0) {
    await supabase
      .from("pendientes_china")
      .update({
        estado: "ASIGNADA",
        contenedor_asignado_id: contenedorId,
        actualizado_en: new Date().toISOString(),
      })
      .eq("id", pendienteId);
  } else {
    await supabase
      .from("pendientes_china")
      .update({ cantidad_pendiente: restante, actualizado_en: new Date().toISOString() })
      .eq("id", pendienteId);
  }
  revalidatePath("/stock/pendientes");
}

export async function agregarProducto(contenedorId: string, formData: FormData) {
  const supabase = await createClient();

  const categoria = texto(formData, "categoria") ?? "";
  const nombre = texto(formData, "nombre") ?? "";
  const sku = texto(formData, "sku") ?? skuSugerido(categoria, nombre);
  const { url: imagenSubida, error: errorImagen } = await subirImagenProducto(
    supabase,
    contenedorId,
    formData,
  );
  const imagenUrl = imagenSubida ?? texto(formData, "imagen_url_previa");
  const cantidad = numero(formData, "cantidad");

  const { data: ultimo } = await supabase
    .from("productos")
    .select("orden")
    .eq("contenedor_id", contenedorId)
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from("productos").insert({
    contenedor_id: contenedorId,
    categoria,
    fabrica: texto(formData, "fabrica"),
    proveedor: texto(formData, "proveedor"),
    imagen_url: imagenUrl,
    sku,
    nombre,
    memo: texto(formData, "memo"),
    cantidad,
    precio_dolares: numero(formData, "precio_dolares"),
    piezas_por_caja: numero(formData, "piezas_por_caja") || 1,
    largo_cm: numero(formData, "largo_cm"),
    ancho_cm: numero(formData, "ancho_cm"),
    alto_cm: numero(formData, "alto_cm"),
    orden: (ultimo?.orden ?? 0) + 1,
  });

  await resolverPendienteChinaSiAplica(supabase, contenedorId, formData, cantidad);

  revalidatePath(`/contenedores/${contenedorId}`);
  return { error: errorImagen ? `La foto no se pudo subir: ${errorImagen}` : null };
}

export async function actualizarProducto(contenedorId: string, productoId: string, formData: FormData) {
  const supabase = await createClient();

  const categoria = texto(formData, "categoria") ?? "";
  const nombre = texto(formData, "nombre") ?? "";
  const sku = texto(formData, "sku") ?? skuSugerido(categoria, nombre);
  const { url: imagenUrl, error: errorImagen } = await subirImagenProducto(
    supabase,
    contenedorId,
    formData,
  );

  await supabase
    .from("productos")
    .update({
      categoria,
      fabrica: texto(formData, "fabrica"),
      proveedor: texto(formData, "proveedor"),
      ...(imagenUrl ? { imagen_url: imagenUrl } : {}),
      sku,
      nombre,
      memo: texto(formData, "memo"),
      cantidad: numero(formData, "cantidad"),
      precio_dolares: numero(formData, "precio_dolares"),
      piezas_por_caja: numero(formData, "piezas_por_caja") || 1,
      largo_cm: numero(formData, "largo_cm"),
      ancho_cm: numero(formData, "ancho_cm"),
      alto_cm: numero(formData, "alto_cm"),
    })
    .eq("id", productoId);

  revalidatePath(`/contenedores/${contenedorId}`);
  return { error: errorImagen ? `La foto no se pudo subir: ${errorImagen}` : null };
}

export async function eliminarProducto(contenedorId: string, productoId: string) {
  const supabase = await createClient();
  await supabase.from("productos").delete().eq("id", productoId);
  revalidatePath(`/contenedores/${contenedorId}`);
}

export async function moverProducto(
  contenedorId: string,
  productos: { id: string; orden: number }[],
  productoId: string,
  direccion: "arriba" | "abajo",
) {
  const supabase = await createClient();

  const ordenados = [...productos].sort((a, b) => a.orden - b.orden);
  const indice = ordenados.findIndex((p) => p.id === productoId);
  const indiceVecino = direccion === "arriba" ? indice - 1 : indice + 1;
  if (indice === -1 || indiceVecino < 0 || indiceVecino >= ordenados.length) return;

  const actual = ordenados[indice];
  const vecino = ordenados[indiceVecino];

  await Promise.all([
    supabase.from("productos").update({ orden: vecino.orden }).eq("id", actual.id),
    supabase.from("productos").update({ orden: actual.orden }).eq("id", vecino.id),
  ]);

  revalidatePath(`/contenedores/${contenedorId}`);
}

export async function subirDocumento(contenedorId: string, tipo: TipoDocumento, formData: FormData) {
  const supabase = await createClient();

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return;

  const ruta = `${contenedorId}/${tipo}-${crypto.randomUUID()}-${nombreArchivoSeguro(archivo.name)}`;
  const { error } = await supabase.storage.from("documentos").upload(ruta, archivo);
  if (error) return;

  await supabase.from("documentos_contenedor").upsert(
    {
      contenedor_id: contenedorId,
      tipo,
      ruta_archivo: ruta,
      nombre_archivo: archivo.name,
    },
    { onConflict: "contenedor_id,tipo" },
  );

  revalidatePath(`/contenedores/${contenedorId}`);
}

export async function eliminarDocumento(contenedorId: string, documentoId: string, rutaArchivo: string) {
  const supabase = await createClient();
  await supabase.storage.from("documentos").remove([rutaArchivo]);
  await supabase.from("documentos_contenedor").delete().eq("id", documentoId);
  revalidatePath(`/contenedores/${contenedorId}`);
}

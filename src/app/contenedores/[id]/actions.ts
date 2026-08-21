"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { skuSugerido } from "@/lib/calculos";
import type { EstadoContenedor, TipoDocumento } from "@/lib/tipos";

function numero(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return valor ? Number(valor) : 0;
}

function texto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

/** Si el estado cambió, guarda el momento en el historial del contenedor. */
async function registrarHistorialSiCambia(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contenedorId: string,
  estadoNuevo: EstadoContenedor,
) {
  const { data: actual } = await supabase
    .from("contenedores")
    .select("estado")
    .eq("id", contenedorId)
    .single();

  if (actual?.estado !== estadoNuevo) {
    await supabase
      .from("historial_estados_contenedor")
      .insert({ contenedor_id: contenedorId, estado: estadoNuevo });
  }
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
      fabrica_principal: texto(formData, "fabrica_principal"),
      proveedor_principal: texto(formData, "proveedor_principal"),
    })
    .eq("id", contenedorId);

  revalidatePath(`/contenedores/${contenedorId}`);
}

export async function cambiarEstado(contenedorId: string, estado: EstadoContenedor) {
  const supabase = await createClient();
  await registrarHistorialSiCambia(supabase, contenedorId, estado);
  await supabase.from("contenedores").update({ estado }).eq("id", contenedorId);
  revalidatePath(`/contenedores/${contenedorId}`);
  revalidatePath("/");
}

export async function eliminarContenedor(contenedorId: string) {
  const supabase = await createClient();
  await supabase.from("contenedores").delete().eq("id", contenedorId);
  redirect("/");
}

export async function agregarAbono(contenedorId: string, formData: FormData) {
  const supabase = await createClient();

  await supabase.from("pagos_mercancia").insert({
    contenedor_id: contenedorId,
    monto_dolares: numero(formData, "monto_dolares"),
    tipo_cambio: numero(formData, "tipo_cambio"),
    pagado: formData.get("pagado") === "true",
  });

  revalidatePath(`/contenedores/${contenedorId}`);
}

export async function eliminarAbono(contenedorId: string, abonoId: string) {
  const supabase = await createClient();
  await supabase.from("pagos_mercancia").delete().eq("id", abonoId);
  revalidatePath(`/contenedores/${contenedorId}`);
}

async function subirImagenProducto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contenedorId: string,
  formData: FormData,
) {
  const imagen = formData.get("imagen");
  if (!(imagen instanceof File) || imagen.size === 0) return null;

  const ruta = `${contenedorId}/${crypto.randomUUID()}-${imagen.name}`;
  const { error } = await supabase.storage.from("productos").upload(ruta, imagen);
  if (error) return null;
  return supabase.storage.from("productos").getPublicUrl(ruta).data.publicUrl;
}

export async function agregarProducto(contenedorId: string, formData: FormData) {
  const supabase = await createClient();

  const categoria = texto(formData, "categoria") ?? "";
  const nombre = texto(formData, "nombre") ?? "";
  const sku = texto(formData, "sku") ?? skuSugerido(categoria, nombre);
  const imagenUrl = await subirImagenProducto(supabase, contenedorId, formData);

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
    cantidad: numero(formData, "cantidad"),
    precio_dolares: numero(formData, "precio_dolares"),
    piezas_por_caja: numero(formData, "piezas_por_caja") || 1,
    largo_cm: numero(formData, "largo_cm"),
    ancho_cm: numero(formData, "ancho_cm"),
    alto_cm: numero(formData, "alto_cm"),
    orden: (ultimo?.orden ?? 0) + 1,
  });

  revalidatePath(`/contenedores/${contenedorId}`);
}

export async function actualizarProducto(contenedorId: string, productoId: string, formData: FormData) {
  const supabase = await createClient();

  const categoria = texto(formData, "categoria") ?? "";
  const nombre = texto(formData, "nombre") ?? "";
  const sku = texto(formData, "sku") ?? skuSugerido(categoria, nombre);
  const imagenUrl = await subirImagenProducto(supabase, contenedorId, formData);

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

  const ruta = `${contenedorId}/${tipo}-${crypto.randomUUID()}-${archivo.name}`;
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

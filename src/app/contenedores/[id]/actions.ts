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

export async function actualizarContenedor(contenedorId: string, formData: FormData) {
  const supabase = await createClient();

  await supabase
    .from("contenedores")
    .update({
      booking: texto(formData, "booking"),
      estado: formData.get("estado") as EstadoContenedor,
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

export async function agregarProducto(contenedorId: string, formData: FormData) {
  const supabase = await createClient();

  const categoria = texto(formData, "categoria") ?? "";
  const nombre = texto(formData, "nombre") ?? "";
  const sku = texto(formData, "sku") ?? skuSugerido(categoria, nombre);

  let imagenUrl: string | null = null;
  const imagen = formData.get("imagen");
  if (imagen instanceof File && imagen.size > 0) {
    const ruta = `${contenedorId}/${crypto.randomUUID()}-${imagen.name}`;
    const { error } = await supabase.storage.from("productos").upload(ruta, imagen);
    if (!error) {
      imagenUrl = supabase.storage.from("productos").getPublicUrl(ruta).data.publicUrl;
    }
  }

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
  });

  revalidatePath(`/contenedores/${contenedorId}`);
}

export async function eliminarProducto(contenedorId: string, productoId: string) {
  const supabase = await createClient();
  await supabase.from("productos").delete().eq("id", productoId);
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

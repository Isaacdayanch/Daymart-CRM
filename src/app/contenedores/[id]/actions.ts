"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { skuSugerido } from "@/lib/calculos";
import type { EstadoContenedor } from "@/lib/tipos";

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
    })
    .eq("id", contenedorId);

  revalidatePath(`/contenedores/${contenedorId}`);
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

  await supabase.from("productos").insert({
    contenedor_id: contenedorId,
    categoria,
    fabrica: texto(formData, "fabrica"),
    proveedor: texto(formData, "proveedor"),
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

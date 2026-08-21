"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EstadoContenedor } from "@/lib/tipos";

function numero(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return valor ? Number(valor) : 0;
}

function texto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

export async function crearContenedor(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.from("contenedores").insert({
    numero: numero(formData, "numero"),
    barco: texto(formData, "barco"),
    booking: texto(formData, "booking"),
    estado: formData.get("estado") as EstadoContenedor,
    flete: numero(formData, "flete"),
    aduana: numero(formData, "aduana"),
    mercancia: numero(formData, "mercancia"),
    tipo_cambio: numero(formData, "tipo_cambio"),
  });

  if (error) {
    redirect(`/contenedores/nuevo?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/");
}

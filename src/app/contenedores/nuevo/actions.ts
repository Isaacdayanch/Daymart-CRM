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

  const { data: contenedor, error } = await supabase
    .from("contenedores")
    .insert({
      numero: numero(formData, "numero"),
      booking: texto(formData, "booking"),
      estado: formData.get("estado") as EstadoContenedor,
      flete_dolares: numero(formData, "flete_dolares"),
      flete_tipo_cambio: numero(formData, "flete_tipo_cambio"),
      aduana_pesos: numero(formData, "aduana_pesos"),
    })
    .select("id")
    .single();

  if (error || !contenedor) {
    redirect(`/contenedores/nuevo?error=${encodeURIComponent(error?.message ?? "error desconocido")}`);
  }

  const montos = formData.getAll("abono_monto").map(Number);
  const tiposCambio = formData.getAll("abono_tipo_cambio").map(Number);
  const pagados = formData.getAll("abono_pagado").map((v) => v === "true");

  const abonos = montos
    .map((monto, i) => ({
      contenedor_id: contenedor.id,
      monto_dolares: monto,
      tipo_cambio: tiposCambio[i] ?? 0,
      pagado: pagados[i] ?? false,
    }))
    .filter((abono) => abono.monto_dolares > 0);

  if (abonos.length > 0) {
    await supabase.from("pagos_mercancia").insert(abonos);
  }

  redirect("/");
}

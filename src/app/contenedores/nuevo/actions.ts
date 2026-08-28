"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { numero, texto } from "@/lib/form-helpers";
import type { EstadoContenedor } from "@/lib/tipos";

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
      otros_gastos_dolares: numero(formData, "otros_gastos_dolares"),
      otros_gastos_tipo_cambio: numero(formData, "otros_gastos_tipo_cambio"),
      fabrica_principal: texto(formData, "fabrica_principal"),
      proveedor_principal: texto(formData, "proveedor_principal"),
    })
    .select("id")
    .single();

  if (error || !contenedor) {
    redirect(`/contenedores/nuevo?error=${encodeURIComponent(error?.message ?? "error desconocido")}`);
  }

  await supabase.from("historial_estados_contenedor").insert({
    contenedor_id: contenedor.id,
    estado: formData.get("estado") as EstadoContenedor,
  });

  const montos = formData.getAll("abono_monto").map(Number);
  const tiposCambio = formData.getAll("abono_tipo_cambio").map(Number);
  const pagados = formData.getAll("abono_pagado").map((v) => v === "true");
  const fechas = formData.getAll("abono_fecha").map((v) => String(v));

  const abonos = montos
    .map((monto, i) => ({
      contenedor_id: contenedor.id,
      monto_dolares: monto,
      tipo_cambio: tiposCambio[i] ?? 0,
      pagado: pagados[i] ?? false,
      fecha: fechas[i] ? new Date(`${fechas[i]}T12:00:00`).toISOString() : new Date().toISOString(),
    }))
    .filter((abono) => abono.monto_dolares > 0);

  if (abonos.length > 0) {
    await supabase.from("pagos_mercancia").insert(abonos);
  }

  redirect("/");
}

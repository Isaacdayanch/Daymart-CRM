"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { texto } from "@/lib/form-helpers";

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

export async function registrarSalida(formData: FormData) {
  const supabase = await createClient();

  const sku = texto(formData, "sku");
  const nombre = texto(formData, "nombre");
  const bodegaId = formData.get("bodega_id") as string;
  const cantidad = Number(formData.get("cantidad")) || 0;
  if (!sku || !nombre || !bodegaId || cantidad <= 0) {
    return { error: "Falta el SKU, la bodega o la cantidad." };
  }

  await supabase.from("movimientos_stock").insert({
    tipo: "SALIDA",
    sku,
    nombre,
    bodega_id: bodegaId,
    cantidad,
    destino: texto(formData, "destino"),
    referencia: texto(formData, "referencia"),
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

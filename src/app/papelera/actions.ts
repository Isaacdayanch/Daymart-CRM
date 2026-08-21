"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function restaurarContenedor(contenedorId: string) {
  const supabase = await createClient();
  await supabase.from("contenedores").update({ eliminado_en: null }).eq("id", contenedorId);
  revalidatePath("/papelera");
  revalidatePath("/");
}

/** Borra el contenedor de verdad, sin marcha atrás. Solo desde la papelera. */
export async function eliminarContenedorDefinitivo(contenedorId: string) {
  const supabase = await createClient();
  await supabase.from("contenedores").delete().eq("id", contenedorId);
  revalidatePath("/papelera");
}

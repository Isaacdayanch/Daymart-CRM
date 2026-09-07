"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { texto } from "@/lib/form-helpers";
import type { Rol } from "@/lib/tipos";

/** Da de alta el perfil de alguien que Isaac ya creó como usuario en el
 * Dashboard de Supabase (Authentication → Users). Se necesita su UUID
 * (se copia desde ahí) porque, sin la llave de administrador, la app no
 * puede buscar cuentas por correo. */
export async function agregarPerfil(formData: FormData) {
  const supabase = await createClient();
  const id = texto(formData, "id");
  const nombre = texto(formData, "nombre");
  const rol = formData.get("rol") as Rol;

  if (!id || !rol) return { error: "Falta el UUID del usuario o el rol." };

  const { error } = await supabase.from("perfiles").insert({ id, nombre, rol });
  if (error) return { error: error.message };

  revalidatePath("/usuarios");
  return { error: null };
}

export async function actualizarRolPerfil(perfilId: string, rol: Rol) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id === perfilId) return; // nadie se cambia el rol a sí mismo, para no quedarse fuera sin querer

  await supabase.from("perfiles").update({ rol }).eq("id", perfilId);
  revalidatePath("/usuarios");
}

/** Quita el acceso al sistema (no borra su cuenta de Supabase, solo su
 * perfil aquí) — vuelve a caer en "sin acceso" si intenta entrar. */
export async function quitarPerfil(perfilId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id === perfilId) return; // nadie se quita el acceso a sí mismo por accidente

  await supabase.from("perfiles").delete().eq("id", perfilId);
  revalidatePath("/usuarios");
}

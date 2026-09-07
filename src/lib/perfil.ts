import { createClient } from "@/lib/supabase/server";
import type { Perfil } from "./tipos";

/** El usuario actual (con su rol) o null si no hay sesión o todavía no
 * tiene perfil asignado — se usa en Server Components para saber qué
 * mostrar/permitir. La verdad legal (qué puede hacer cada quien) la manda
 * el middleware + las políticas de la base de datos; esto es para la UI. */
export async function obtenerPerfilActual(): Promise<(Perfil & { email: string | null }) | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Perfil>();

  if (!perfil) return null;
  return { ...perfil, email: user.email ?? null };
}

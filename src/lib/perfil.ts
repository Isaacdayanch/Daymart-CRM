import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Perfil } from "./tipos";

/** El usuario actual (con su rol) o null si no hay sesión o todavía no
 * tiene perfil asignado — se usa en Server Components para saber qué
 * mostrar/permitir. La verdad legal (qué puede hacer cada quien) la manda
 * el proxy + las políticas de la base de datos; esto es para la UI.
 *
 * Velocidad (Isaac, 20 oct: "está muy lento"): va envuelto en `cache()` de
 * React, así el layout y la página de una misma petición lo calculan UNA
 * vez (antes cada uno hacía su propia vuelta a Supabase). Y usa
 * `getClaims()`, que verifica la sesión localmente con la llave pública del
 * proyecto (sin viaje al servidor de login) cuando el proyecto usa llaves
 * asimétricas; si no, cae solo a la verificación en el servidor. */
export const obtenerPerfilActual = cache(async (): Promise<(Perfil & { email: string | null }) | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return null;

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("*")
    .eq("id", sub)
    .maybeSingle<Perfil>();

  if (!perfil) return null;
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;
  return { ...perfil, email };
});

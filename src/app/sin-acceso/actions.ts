"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Si todavía no hay NINGÚN perfil creado, quien entra primero (Isaac) se
 * da de alta a sí mismo como dueño — así no se queda sin poder usar su
 * propio sistema. Si ya hay perfiles, esto no hace nada (lo bloquea la
 * política de la base de datos). */
export async function reclamarAccesoDeDueno() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("perfiles").insert({ id: user.id, rol: "dueno" });
  if (error) {
    return { error: "Ya hay un dueño registrado — pídele que te dé acceso desde Usuarios." };
  }

  redirect("/");
}

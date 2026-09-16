import { createClient } from "@supabase/supabase-js";

/** Cliente de Supabase con la service role key — SOLO para código del
 * servidor que necesita tocar tablas que el navegador jamás debe ver
 * (ej. las llaves de acceso de Mercado Libre). Nunca importar esto desde
 * un componente cliente. */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.");
  return createClient(url, key, { auth: { persistSession: false } });
}

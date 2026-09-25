import { API_URL, obtenerAccessToken } from "@/lib/mercadolibre-auth";

/** POST a Mercado Libre (ej. aplicar una promoción). Requiere permiso de
 * escritura de la aplicación en el DevCenter. */
export async function mercadolibrePost<T>(ruta: string, cuerpo: unknown): Promise<T | null> {
  const token = await obtenerAccessToken();
  const respuesta = await fetch(`${API_URL}${ruta}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
    cache: "no-store",
  });
  const texto = await respuesta.text().catch(() => "");
  if (!respuesta.ok) {
    let detalle = texto.slice(0, 300);
    try {
      const j = JSON.parse(texto) as { message?: string; error?: string; cause?: ({ message?: string } | string)[] };
      detalle = [j.message ?? j.error, ...(j.cause ?? []).map((c) => (typeof c === "string" ? c : c.message))].filter(Boolean).join(" · ") || detalle;
    } catch {
      // texto crudo
    }
    if (respuesta.status === 403) detalle = `${detalle} (¿la aplicación tiene permiso de escritura en el DevCenter de Mercado Libre?)`;
    throw new Error(`Mercado Libre respondió ${respuesta.status} en ${ruta}: ${detalle}`);
  }
  if (!texto) return null;
  try {
    return JSON.parse(texto) as T;
  } catch {
    return null;
  }
}

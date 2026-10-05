import { headers } from "next/headers";

/** Dominio real donde vive la app (para armar links completos que se
 * copian/comparten), leído de la petición actual. */
export async function baseUrlActual() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "daymart-crm.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

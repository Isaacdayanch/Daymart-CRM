import { NextResponse, type NextRequest } from "next/server";
import { obtenerPerfilActual } from "@/lib/perfil";
import { conectarConCodigo } from "@/lib/mercadolibre-auth";

export const dynamic = "force-dynamic";

/** A donde regresa Mercado Libre después de que Isaac autoriza. Verifica
 * el `state` (que salió de nosotros), cambia el código por las llaves y
 * guarda la conexión. */
export async function GET(request: NextRequest) {
  const perfil = await obtenerPerfilActual();
  if (perfil?.rol !== "dueno") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const esperado = request.cookies.get("ml_oauth_state")?.value;
  const errorMl = request.nextUrl.searchParams.get("error");

  const destino = (query: string) => {
    const r = NextResponse.redirect(new URL(`/mercadolibre/conexion?${query}`, request.url));
    r.cookies.delete("ml_oauth_state");
    return r;
  };

  if (errorMl) return destino(`error=${encodeURIComponent(errorMl)}`);
  if (!code) return destino("error=sin_codigo");
  if (!state || !esperado || state !== esperado) return destino("error=state");

  try {
    const nickname = await conectarConCodigo(code);
    return destino(`ok=1&cuenta=${encodeURIComponent(nickname ?? "")}`);
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error desconocido";
    return destino(`error=${encodeURIComponent(mensaje)}`);
  }
}

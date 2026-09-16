import { NextResponse, type NextRequest } from "next/server";
import { obtenerPerfilActual } from "@/lib/perfil";
import { configuracionCompleta, urlAutorizacion } from "@/lib/mercadolibre-auth";

export const dynamic = "force-dynamic";

/** Manda a Isaac a la pantalla de autorización de Mercado Libre. Solo el
 * dueño puede iniciar la conexión. */
export async function GET(request: NextRequest) {
  const perfil = await obtenerPerfilActual();
  if (perfil?.rol !== "dueno") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (!configuracionCompleta()) {
    return NextResponse.redirect(new URL("/mercadolibre?error=config", request.url));
  }

  const state = crypto.randomUUID();
  const respuesta = NextResponse.redirect(urlAutorizacion(state));
  respuesta.cookies.set("ml_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return respuesta;
}

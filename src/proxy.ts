import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const RUTAS_PUBLICAS = ["/login", "/sin-acceso"];

// A dónde puede entrar una operadora — cualquier otra ruta la regresa
// aquí. El resto del sistema (contenedores, costos, usuarios) es solo
// del dueño.
const RUTAS_OPERADORA = ["/stock/salidas", "/stock/carga-masiva"];

function coincide(pathname: string, rutas: string[]) {
  return rutas.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  if (!user) {
    if (coincide(pathname, RUTAS_PUBLICAS)) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", user.id)
    .maybeSingle<{ rol: string }>();

  if (!perfil) {
    if (pathname === "/sin-acceso") return response;
    const url = request.nextUrl.clone();
    url.pathname = "/sin-acceso";
    return NextResponse.redirect(url);
  }

  if (perfil.rol === "operadora" && !coincide(pathname, RUTAS_OPERADORA)) {
    const url = request.nextUrl.clone();
    url.pathname = "/stock/salidas";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

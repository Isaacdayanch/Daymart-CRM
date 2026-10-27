import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// "/api/respaldo" no lleva sesión de Supabase (lo llama Google Apps Script
// desde afuera) — se protege solo con su propia clave secreta, no con
// login. Si algún día se agregan más rutas bajo /api que sí deban requerir
// sesión, hay que sacarlas de esta excepción.
// "/api/mercadolibre/notificaciones" también es pública: la llama Mercado
// Libre desde sus servidores (sin sesión) para avisar de ventas/cambios.
// "/catalogo/<token>" es el catálogo para vendedores externos (migración
// 0043): sin login, protegido por el token secreto del link; solo muestra
// la ficha del producto y piezas en bodega, nunca precios ni costos.
const RUTAS_PUBLICAS = ["/login", "/sin-acceso", "/api/respaldo", "/api/director", "/api/whatsapp", "/api/mercadolibre/notificaciones", "/api/mercadolibre/cron", "/catalogo"];

// Una operadora ve todo lo de Stock y los contenedores (para poder hacer
// match del inventario real) — las páginas mismas esconden los números de
// dinero cuando el rol es operadora. Lo que NO puede tocar: crear
// contenedores nuevos, usuarios, ni la papelera.
const RUTAS_OPERADORA = ["/", "/stock", "/contenedores"];
const RUTAS_BLOQUEADAS_OPERADORA = ["/contenedores/nuevo", "/contenedores/planeador", "/usuarios", "/papelera"];

// Velocidad (Isaac, 20 oct: "está muy lento"). Este "portero" corre en CADA
// clic. Antes hacía dos viajes a Supabase por petición (verificar la sesión
// en el servidor de login + leer el rol en `perfiles`), antes de que la
// página siquiera empezara a cargar. Ahora:
// 1. La sesión se verifica localmente con `getClaims()` (firma del token
//    contra la llave pública del proyecto; sin viaje si el proyecto usa
//    llaves asimétricas).
// 2. El rol se guarda en una cookie firmada (`dm_perfil`) por 10 minutos:
//    mientras sea válida, cero consultas. Si a un usuario se le cambia el
//    rol, tarda hasta 10 min en aplicar en el portero (las páginas y la
//    base de datos sí lo ven al instante).
// La verdad legal sigue siendo la base de datos (políticas RLS): esta
// cookie solo decide a qué pantallas lo manda el portero.
const COOKIE_PERFIL = "dm_perfil";
const VIGENCIA_PERFIL_S = 10 * 60;

function coincide(pathname: string, rutas: string[]) {
  return rutas.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

function aBase64Url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function firmar(texto: string, clave: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return aBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(texto))));
}

function claveFirma() {
  // Secreto solo del servidor; nunca viaja al navegador. Sin él, el portero
  // simplemente consulta el rol cada vez (como antes).
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
}

/** Rol guardado en la cookie, si es del mismo usuario, no ha vencido y la firma cuadra. */
async function rolDeCookie(request: NextRequest, sub: string): Promise<string | null> {
  const clave = claveFirma();
  const crudo = request.cookies.get(COOKIE_PERFIL)?.value;
  if (!clave || !crudo) return null;
  const [cuerpo, firma] = crudo.split(".");
  if (!cuerpo || !firma) return null;
  if ((await firmar(cuerpo, clave)) !== firma) return null;
  const [usuario, rol, vence] = cuerpo.split("|");
  if (usuario !== sub || !rol || Number(vence) < Date.now() / 1000) return null;
  return rol;
}

async function cookiePerfil(sub: string, rol: string): Promise<{ value: string; maxAge: number } | null> {
  const clave = claveFirma();
  if (!clave) return null;
  const cuerpo = `${sub}|${rol}|${Math.floor(Date.now() / 1000) + VIGENCIA_PERFIL_S}`;
  return { value: `${cuerpo}.${await firmar(cuerpo, clave)}`, maxAge: VIGENCIA_PERFIL_S };
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

  const { data: sesion } = await supabase.auth.getClaims();
  const sub = sesion?.claims?.sub ?? null;
  const { pathname } = request.nextUrl;

  if (!sub) {
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

  let rol = await rolDeCookie(request, sub);
  let cookieNueva: { value: string; maxAge: number } | null = null;
  if (!rol) {
    const { data: perfil } = await supabase.from("perfiles").select("rol").eq("id", sub).maybeSingle<{ rol: string }>();
    if (!perfil) {
      if (pathname === "/sin-acceso") return response;
      const url = request.nextUrl.clone();
      url.pathname = "/sin-acceso";
      return NextResponse.redirect(url);
    }
    rol = perfil.rol;
    cookieNueva = await cookiePerfil(sub, rol);
  }

  const ponerCookie = (res: NextResponse) => {
    if (cookieNueva) res.cookies.set(COOKIE_PERFIL, cookieNueva.value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: cookieNueva.maxAge });
    return res;
  };

  if (rol === "operadora" && (coincide(pathname, RUTAS_BLOQUEADAS_OPERADORA) || !coincide(pathname, RUTAS_OPERADORA))) {
    const url = request.nextUrl.clone();
    url.pathname = "/stock";
    return ponerCookie(NextResponse.redirect(url));
  }

  return ponerCookie(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

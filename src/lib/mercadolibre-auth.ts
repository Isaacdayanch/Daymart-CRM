// Conexión (OAuth) con Mercado Libre: Isaac autoriza una vez desde el CRM,
// Mercado Libre nos da un "access token" (dura 6 horas) y un "refresh
// token" (para pedir uno nuevo sin volver a autorizar). Todo se guarda en
// mercadolibre_conexion, que solo el servidor puede leer.

import { createServiceClient } from "@/lib/supabase/servicio";

const AUTH_URL = "https://auth.mercadolibre.com.mx/authorization";
const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";
export const API_URL = "https://api.mercadolibre.com";

export interface ConexionMercadoLibre {
  id: number;
  ml_user_id: number;
  nickname: string | null;
  access_token: string;
  refresh_token: string;
  expira_en: string;
  scope: string | null;
  conectado_en: string;
  actualizado_en: string;
}

interface RespuestaToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  user_id: number;
  refresh_token: string;
}

function credenciales() {
  const appId = process.env.MERCADOLIBRE_APP_ID;
  const secret = process.env.MERCADOLIBRE_SECRET_KEY;
  const redirect = process.env.MERCADOLIBRE_REDIRECT_URI;
  if (!appId || !secret || !redirect) {
    throw new Error(
      "Faltan las variables MERCADOLIBRE_APP_ID, MERCADOLIBRE_SECRET_KEY o MERCADOLIBRE_REDIRECT_URI en Vercel.",
    );
  }
  return { appId, secret, redirect };
}

export function configuracionCompleta() {
  return Boolean(
    process.env.MERCADOLIBRE_APP_ID && process.env.MERCADOLIBRE_SECRET_KEY && process.env.MERCADOLIBRE_REDIRECT_URI,
  );
}

/** A dónde mandar a Isaac para que autorice. `state` es un código al azar
 * que luego se verifica al regresar, para que nadie pueda "inyectar" una
 * autorización ajena. */
export function urlAutorizacion(state: string) {
  const { appId, redirect } = credenciales();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: appId,
    redirect_uri: redirect,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function pedirToken(body: Record<string, string>): Promise<RespuestaToken> {
  const respuesta = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const mensaje = (datos as { message?: string; error?: string }).message ?? (datos as { error?: string }).error;
    throw new Error(`Mercado Libre rechazó la solicitud (${respuesta.status}): ${mensaje ?? "sin detalle"}`);
  }
  return datos as RespuestaToken;
}

async function guardarToken(token: RespuestaToken, nickname: string | null) {
  const supabase = createServiceClient();
  const ahora = new Date();
  const expira = new Date(ahora.getTime() + token.expires_in * 1000).toISOString();
  const { error } = await supabase.from("mercadolibre_conexion").upsert({
    id: 1,
    ml_user_id: token.user_id,
    nickname,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expira_en: expira,
    scope: token.scope,
    actualizado_en: ahora.toISOString(),
  });
  if (error) throw new Error(`No se pudo guardar la conexión: ${error.message}`);
}

/** Cambia el código que regresa Mercado Libre por las llaves de acceso y
 * guarda la conexión. Regresa el nickname de la cuenta conectada. */
export async function conectarConCodigo(code: string) {
  const { appId, secret, redirect } = credenciales();
  const token = await pedirToken({
    grant_type: "authorization_code",
    client_id: appId,
    client_secret: secret,
    code,
    redirect_uri: redirect,
  });
  const usuario = await fetch(`${API_URL}/users/me`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: "no-store",
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const nickname = (usuario as { nickname?: string } | null)?.nickname ?? null;
  await guardarToken(token, nickname);
  return nickname;
}

export async function obtenerConexion(): Promise<ConexionMercadoLibre | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("mercadolibre_conexion").select("*").eq("id", 1).maybeSingle<ConexionMercadoLibre>();
  return data ?? null;
}

/** Access token listo para usar: si está por vencer (o ya venció), pide
 * uno nuevo con el refresh token y lo guarda. El refresh token de Mercado
 * Libre es de un solo uso: cada vez que se renueva, llega uno nuevo. */
export async function obtenerAccessToken(): Promise<string> {
  const conexion = await obtenerConexion();
  if (!conexion) throw new Error("Mercado Libre no está conectado todavía.");

  const margenMs = 5 * 60 * 1000;
  if (new Date(conexion.expira_en).getTime() - Date.now() > margenMs) return conexion.access_token;

  const { appId, secret } = credenciales();
  const token = await pedirToken({
    grant_type: "refresh_token",
    client_id: appId,
    client_secret: secret,
    refresh_token: conexion.refresh_token,
  });
  await guardarToken(token, conexion.nickname);
  return token.access_token;
}

/** Llamada genérica a la API de Mercado Libre con el token vigente. */
export async function mercadolibreGet<T>(ruta: string): Promise<T> {
  const token = await obtenerAccessToken();
  const respuesta = await fetch(`${API_URL}${ruta}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!respuesta.ok) {
    const texto = await respuesta.text().catch(() => "");
    throw new Error(`Mercado Libre respondió ${respuesta.status} en ${ruta}: ${texto.slice(0, 200)}`);
  }
  return (await respuesta.json()) as T;
}

export async function desconectarMercadoLibre() {
  const supabase = createServiceClient();
  const { error } = await supabase.from("mercadolibre_conexion").delete().eq("id", 1);
  if (error) throw new Error(error.message);
}

export function tokenVigente(conexion: Pick<ConexionMercadoLibre, "expira_en">, ahora = Date.now()) {
  return new Date(conexion.expira_en).getTime() > ahora;
}

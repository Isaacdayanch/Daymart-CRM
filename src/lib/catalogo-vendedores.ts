// Catálogo para vendedores externos (migración 0043).
//
// Una sola fuente de datos para las tres salidas: la página pública del
// vendedor (`/catalogo/[token]`), su PDF, y el PDF que saca Isaac desde
// Stock → Catálogo. Aquí NUNCA se calculan ni se devuelven costos, precios
// ni nada de Finanzas: solo la ficha del producto y las piezas en bodega.

import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resumenPorSku } from "./calculos-stock";
import { obtenerPiezasPorCajaPorSku } from "./productos-stock";
import { createServiceClient } from "./supabase/servicio";
import type { AccesoCatalogo, Marca, MovimientoStock, ProductoCatalogo } from "./tipos";

export interface ProductoVendedores {
  sku: string;
  nombre: string;
  marca: string | null;
  linea: string | null;
  categoria: string | null;
  imagenUrl: string | null;
  piezasPorCaja: number;
  largoCm: number;
  anchoCm: number;
  altoCm: number;
  memo: string | null;
  descripcion: string | null;
  /** Piezas en bodega (lo que Isaac puede entregar). Full NO se incluye:
   * eso lo vende Mercado Libre directo (decisión de Isaac, 5 oct). */
  stock: number;
}

export interface FiltrosCatalogo {
  q?: string;
  categoria?: string;
  marca?: string;
  /** true = solo productos con piezas en bodega. */
  soloConStock?: boolean;
}

export interface CatalogoVendedores {
  productos: ProductoVendedores[];
  categorias: string[];
  marcas: { id: string; nombre: string }[];
  /** Productos que había antes de aplicar los filtros. */
  total: number;
}

/** Lee un valor de búsqueda (`?q=`, `?categoria=`…) de los searchParams. */
export function filtrosDeParams(params: Record<string, string | undefined>): FiltrosCatalogo {
  return {
    q: params.q?.trim() || undefined,
    categoria: params.categoria?.trim() || undefined,
    marca: params.marca?.trim() || undefined,
    soloConStock: params.todos !== "1",
  };
}

export function queryDeFiltros(f: FiltrosCatalogo, extra: Record<string, string | undefined> = {}) {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.categoria) p.set("categoria", f.categoria);
  if (f.marca) p.set("marca", f.marca);
  if (!f.soloConStock) p.set("todos", "1");
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Arma el catálogo (ficha + piezas en bodega) con el cliente que se le
 * pase: el de sesión (Isaac desde Stock) o el de servicio (página pública). */
export async function cargarCatalogoVendedores(supabase: SupabaseClient, filtros: FiltrosCatalogo = {}): Promise<CatalogoVendedores> {
  const [{ data: catalogo }, { data: marcas }, { data: movimientos }, piezasPorCajaPorSku] = await Promise.all([
    supabase.from("productos_catalogo").select("*").is("eliminado_en", null).order("nombre").returns<ProductoCatalogo[]>(),
    supabase.from("marcas").select("id, nombre").is("eliminado_en", null).returns<Pick<Marca, "id" | "nombre">[]>(),
    supabase.from("movimientos_stock").select("*").returns<MovimientoStock[]>(),
    obtenerPiezasPorCajaPorSku(supabase),
  ]);

  const stockPorSku = new Map(resumenPorSku(movimientos ?? [], 60, piezasPorCajaPorSku).map((r) => [r.sku, r]));
  const marcaPorId = new Map((marcas ?? []).map((m) => [m.id, m.nombre]));

  const todos: ProductoVendedores[] = (catalogo ?? []).map((p) => {
    const r = stockPorSku.get(p.sku);
    return {
      sku: p.sku,
      nombre: p.nombre,
      marca: p.marca_id ? (marcaPorId.get(p.marca_id) ?? null) : null,
      linea: p.linea,
      categoria: p.categoria,
      imagenUrl: p.imagen_url ?? r?.imagenUrl ?? null,
      piezasPorCaja: Number(p.piezas_por_caja) || r?.piezasPorCaja || 1,
      largoCm: Number(p.largo_cm) || 0,
      anchoCm: Number(p.ancho_cm) || 0,
      altoCm: Number(p.alto_cm) || 0,
      memo: p.memo,
      descripcion: p.descripcion ?? null,
      stock: Math.max(0, r?.stockActual ?? 0),
    };
  });

  const texto = filtros.q?.toLowerCase();
  const productos = todos
    .filter((p) => !filtros.soloConStock || p.stock > 0)
    .filter((p) => !filtros.categoria || p.categoria === filtros.categoria)
    .filter((p) => !filtros.marca || p.marca === filtros.marca)
    .filter((p) => !texto || [p.nombre, p.sku, p.categoria, p.linea, p.marca, p.descripcion].some((t) => t?.toLowerCase().includes(texto)))
    .sort((a, b) => (a.categoria ?? "").localeCompare(b.categoria ?? "", "es") || a.nombre.localeCompare(b.nombre, "es"));

  const categorias = Array.from(new Set(todos.map((p) => p.categoria).filter((c): c is string => Boolean(c)))).sort((a, b) => a.localeCompare(b, "es"));
  const marcasUsadas = (marcas ?? []).filter((m) => todos.some((p) => p.marca === m.nombre));

  return { productos, categorias, marcas: marcasUsadas, total: todos.length };
}

/** Token largo al azar para el link del vendedor (32 caracteres, letras y
 * números seguros para URL). */
export function generarTokenAcceso() {
  return randomBytes(24).toString("base64url");
}

/** Busca el acceso por su token con la service role key (la página pública
 * no tiene sesión). Devuelve null si no existe o ya se cortó. Si
 * `registrarVisita`, anota la fecha y suma una visita. */
export async function obtenerAccesoPorToken(token: string, registrarVisita = false): Promise<AccesoCatalogo | null> {
  if (!token || token.length < 16 || token.length > 64) return null;
  const servicio = createServiceClient();
  const { data } = await servicio.from("accesos_catalogo").select("*").eq("token", token).is("revocado_en", null).maybeSingle<AccesoCatalogo>();
  if (!data) return null;
  if (registrarVisita) {
    await servicio.from("accesos_catalogo").update({ ultimo_acceso_en: new Date().toISOString(), visitas: (data.visitas ?? 0) + 1 }).eq("id", data.id);
  }
  return data;
}

/** Catálogo para la página pública: usa la service role key y SOLO entrega
 * los campos de `ProductoVendedores` (sin costos). */
export async function cargarCatalogoPublico(filtros: FiltrosCatalogo) {
  return cargarCatalogoVendedores(createServiceClient(), filtros);
}

export function medidasTexto(p: Pick<ProductoVendedores, "largoCm" | "anchoCm" | "altoCm">) {
  if (!p.largoCm && !p.anchoCm && !p.altoCm) return null;
  return `${p.largoCm} × ${p.anchoCm} × ${p.altoCm} cm`;
}

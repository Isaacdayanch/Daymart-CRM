// Catálogo para vendedores externos (módulo Vendedores, migración 0044).
//
// Una sola fuente de datos para todas las salidas: la lista de precios de
// Isaac, el link privado del vendedor, el link para sus clientes y los PDF.
// El COSTO solo se incluye cuando lo pide Isaac (`conCosto`), nunca en las
// páginas públicas; Finanzas y contenedores jamás pasan por aquí.

import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resumenPorSku } from "./calculos-stock";
import { comisionPorPieza, type ReglaComision } from "./calculos-vendedores";
import { obtenerPiezasPorCajaPorSku } from "./productos-stock";
import { createServiceClient } from "./supabase/servicio";
import type { ComisionVendedorProducto, Marca, MovimientoStock, ProductoCatalogo, Vendedor } from "./tipos";

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
  /** Precio de venta al público (sin IVA). Null = sin precio todavía. */
  precioVenta: number | null;
  /** Costo promedio del SKU: SOLO para Isaac (`conCosto`). */
  costo?: number;
  /** Comisión por pieza del vendedor al que se le está mostrando. */
  comision?: number;
}

export interface FiltrosCatalogo {
  q?: string;
  categoria?: string;
  marca?: string;
  /** true = solo productos con piezas en bodega. */
  soloConStock?: boolean;
  /** true = solo productos que ya tienen precio de venta. */
  soloConPrecio?: boolean;
}

export interface CatalogoVendedores {
  productos: ProductoVendedores[];
  categorias: string[];
  marcas: { id: string; nombre: string }[];
  /** Productos que había antes de aplicar los filtros. */
  total: number;
}

/** Lee los filtros (`?q=`, `?categoria=`…) de los searchParams. */
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

/** Arma el catálogo (ficha + piezas en bodega + precio) con el cliente que
 * se le pase: el de sesión (Isaac) o el de servicio (páginas públicas). */
export async function cargarCatalogoVendedores(
  supabase: SupabaseClient,
  filtros: FiltrosCatalogo = {},
  opciones: { conCosto?: boolean } = {},
): Promise<CatalogoVendedores> {
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
    const precio = p.precio_venta === null || p.precio_venta === undefined ? null : Number(p.precio_venta);
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
      precioVenta: precio && precio > 0 ? precio : null,
      ...(opciones.conCosto ? { costo: r?.costoPromedio ?? 0 } : {}),
    };
  });

  const texto = filtros.q?.toLowerCase();
  const productos = todos
    .filter((p) => !filtros.soloConStock || p.stock > 0)
    .filter((p) => !filtros.soloConPrecio || p.precioVenta !== null)
    .filter((p) => !filtros.categoria || p.categoria === filtros.categoria)
    .filter((p) => !filtros.marca || p.marca === filtros.marca)
    .filter((p) => !texto || [p.nombre, p.sku, p.categoria, p.linea, p.marca, p.descripcion].some((t) => t?.toLowerCase().includes(texto)))
    .sort((a, b) => (a.categoria ?? "").localeCompare(b.categoria ?? "", "es") || a.nombre.localeCompare(b.nombre, "es"));

  const categorias = Array.from(new Set(todos.map((p) => p.categoria).filter((c): c is string => Boolean(c)))).sort((a, b) => a.localeCompare(b, "es"));
  const marcasUsadas = (marcas ?? []).filter((m) => todos.some((p) => p.marca === m.nombre));

  return { productos, categorias, marcas: marcasUsadas, total: todos.length };
}

/** Regla de comisión que aplica a un vendedor para un SKU: la especial del
 * producto si existe, si no la habitual del vendedor. */
export function reglaComisionDe(vendedor: Pick<Vendedor, "comision_pct" | "comision_fija">, especiales: ComisionVendedorProducto[], sku: string): ReglaComision {
  const e = especiales.find((c) => c.sku === sku);
  if (e) return { pct: Number(e.comision_pct) || 0, fija: Number(e.comision_fija) || 0 };
  return { pct: Number(vendedor.comision_pct) || 0, fija: Number(vendedor.comision_fija) || 0 };
}

/** Le pone a cada producto la comisión por pieza de ese vendedor. */
export function conComisionDe(productos: ProductoVendedores[], vendedor: Vendedor, especiales: ComisionVendedorProducto[]) {
  return productos.map((p) => ({
    ...p,
    comision: p.precioVenta ? comisionPorPieza(p.precioVenta, reglaComisionDe(vendedor, especiales, p.sku)) : undefined,
  }));
}

/** Token largo al azar para los links (32 caracteres, letras y números
 * seguros para URL). */
export function generarTokenAcceso() {
  return randomBytes(24).toString("base64url");
}

export type ModoCatalogo = "vendedor" | "clientes";

/** Busca el vendedor por cualquiera de sus dos tokens con la service role
 * key (las páginas públicas no tienen sesión). Devuelve también en qué
 * modo se abrió (link privado del vendedor o link para sus clientes). Null
 * si no existe, está cortado o eliminado. Si `registrarVisita`, anota la
 * fecha y suma una visita al contador del modo correspondiente. */
export async function obtenerVendedorPorToken(token: string, registrarVisita = false): Promise<{ vendedor: Vendedor; modo: ModoCatalogo } | null> {
  if (!token || token.length < 16 || token.length > 80) return null;
  const servicio = createServiceClient();
  const { data } = await servicio
    .from("vendedores")
    .select("*")
    .or(`token_vendedor.eq.${token},token_clientes.eq.${token}`)
    .is("revocado_en", null)
    .is("eliminado_en", null)
    .maybeSingle<Vendedor>();
  if (!data) return null;
  const modo: ModoCatalogo = data.token_vendedor === token ? "vendedor" : "clientes";
  if (registrarVisita) {
    const ahora = new Date().toISOString();
    await servicio
      .from("vendedores")
      .update(
        modo === "vendedor"
          ? { ultimo_acceso_en: ahora, visitas: (data.visitas ?? 0) + 1 }
          : { ultimo_acceso_clientes_en: ahora, visitas_clientes: (data.visitas_clientes ?? 0) + 1 },
      )
      .eq("id", data.id);
  }
  return { vendedor: data, modo };
}

/** Catálogo para las páginas públicas (service role key, SIN costo). En
 * modo vendedor se agrega su comisión por pieza. Solo productos con precio
 * (sin precio no se ofrece). */
export async function cargarCatalogoPublico(vendedor: Vendedor, modo: ModoCatalogo, filtros: FiltrosCatalogo) {
  const servicio = createServiceClient();
  const [catalogo, { data: especiales }] = await Promise.all([
    cargarCatalogoVendedores(servicio, { ...filtros, soloConPrecio: true }),
    servicio.from("comisiones_vendedor_producto").select("*").eq("vendedor_id", vendedor.id).returns<ComisionVendedorProducto[]>(),
  ]);
  if (modo === "vendedor") catalogo.productos = conComisionDe(catalogo.productos, vendedor, especiales ?? []);
  return catalogo;
}

export function medidasTexto(p: Pick<ProductoVendedores, "largoCm" | "anchoCm" | "altoCm">) {
  if (!p.largoCm && !p.anchoCm && !p.altoCm) return null;
  return `${p.largoCm} × ${p.anchoCm} × ${p.altoCm} cm`;
}

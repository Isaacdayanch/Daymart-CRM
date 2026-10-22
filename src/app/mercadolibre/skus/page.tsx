import { createClient } from "@/lib/supabase/server";
import { todosLosMovimientosStock } from "@/lib/cargar-todo";
import { resumenPorSku } from "@/lib/calculos-stock";
import { obtenerCatalogo, obtenerMarcas, skusExistentes } from "@/lib/catalogo";
import { obtenerSugerenciasCatalogo } from "@/lib/catalogo-proveedores";
import type { Bodega } from "@/lib/tipos";
import { obtenerPiezasPorCajaPorSku } from "@/lib/productos-stock";
import { agruparPorSkuMl, esPendienteReal, esPublicacionPendienteReal, type ProductoCrmResumen } from "@/lib/mercadolibre-skus";
import { claveCodigoMl, obtenerIgnorados, obtenerPublicaciones, obtenerVinculos, type LigaIgnorada } from "@/lib/mercadolibre-stock";
import { agruparPorCodigoMl, esCodigoPendiente, type GrupoCodigoMl } from "@/lib/mercadolibre-codigos";
import Link from "next/link";
import type { ConfiguracionStock } from "@/lib/tipos";
import { TablaSkus } from "./tabla-skus";
import { TablaCodigos } from "./tabla-codigos";
import { BotonSincronizarStock } from "../stock/boton-sincronizar-stock";
import { RevisarFaltantes } from "../stock/revisar-faltantes";
import { obtenerConexion } from "@/lib/mercadolibre-auth";
import { obtenerEstadoSync } from "@/lib/mercadolibre-ordenes";
import { formatoFechaHoraMx } from "@/lib/fechas-mx";

export const maxDuration = 60;

/** "Ligar": dos vistas (21 oct). La principal, "Productos en Full", es un
 * renglón por Código ML (la liga que manda en todo el sistema). La segunda,
 * "Sin Full", es la de siempre por SKU de ML / publicación, solo con las
 * publicaciones que no tienen Código ML (Colecta, Flex…). */
export default async function LigarSkus({ searchParams }: { searchParams: Promise<{ q?: string; vista?: string }> }) {
  const { q, vista } = await searchParams;
  const sinFull = vista === "sinfull";
  const supabase = await createClient();
  const [{ data: movimientos }, { data: configuracion }, piezasPorCajaPorSku, catalogo, marcas, sugerencias, { data: bodegas }, skusTodos] = await Promise.all([
    todosLosMovimientosStock(supabase),
    supabase.from("configuracion_stock").select("*").maybeSingle<ConfiguracionStock>(),
    obtenerPiezasPorCajaPorSku(supabase),
    obtenerCatalogo(supabase).catch(() => []),
    obtenerMarcas(supabase).catch(() => []),
    obtenerSugerenciasCatalogo(supabase).catch(() => ({ categorias: [] as string[] })),
    supabase.from("bodegas").select("*").is("eliminado_en", null).order("nombre").returns<Bodega[]>(),
    skusExistentes(supabase).catch(() => new Set<string>()),
  ]);
  // Para "+ Nuevo producto con estos datos" desde aquí mismo (16 oct; Isaac se
  // atoró ligando los steps porque el producto no existía en Stock y la
  // opción solo estaba en Publicaciones).
  const catalogoParaNuevo = {
    marcas: marcas.map((m) => ({ id: m.id, nombre: m.nombre, codigo: m.codigo })),
    categorias: sugerencias.categorias,
    bodegas: (bodegas ?? []).map((b) => ({ id: b.id, nombre: b.nombre })),
    skusExistentes: Array.from(skusTodos),
  };
  const resumenes = resumenPorSku(movimientos ?? [], configuracion?.dias_espera ?? 60, piezasPorCajaPorSku);
  const porSku = new Map<string, ProductoCrmResumen>();
  for (const p of catalogo) porSku.set(p.sku, { sku: p.sku, nombre: p.nombre, imagenUrl: p.imagen_url, stockActual: 0 });
  for (const r of resumenes) {
    const previo = porSku.get(r.sku);
    porSku.set(r.sku, { sku: r.sku, nombre: previo?.nombre ?? r.nombre, imagenUrl: previo?.imagenUrl ?? r.imagenUrl, stockActual: r.stockActual });
  }
  const productos = Array.from(porSku.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  let error: string | null = null;
  let grupos: ReturnType<typeof agruparPorSkuMl>["grupos"] = [];
  let sinSku: ReturnType<typeof agruparPorSkuMl>["sinSku"] = [];
  let ignorados: LigaIgnorada[] = [];
  let codigos: GrupoCodigoMl[] = [];
  let totalPublicaciones = 0;
  try {
    const [publicaciones, vinculos, ign] = await Promise.all([obtenerPublicaciones(), obtenerVinculos(), obtenerIgnorados()]);
    ignorados = ign;
    totalPublicaciones = publicaciones.length;
    const claves = new Set(ign.map((i) => i.clave));
    codigos = agruparPorCodigoMl(publicaciones, vinculos, productos, skusTodos, claves);
    ({ grupos, sinSku } = agruparPorSkuMl(
      publicaciones.filter((p) => !p.inventory_id),
      vinculos,
      productos,
      claves,
    ));
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudieron leer las publicaciones.";
  }
  // Pendientes de verdad: con alguna publicación activa y no olvidados.
  const pendientes = grupos.filter(esPendienteReal).length + sinSku.filter(esPublicacionPendienteReal).length;
  const pendientesFull = codigos.filter(esCodigoPendiente).length;
  const clavesOlvido = Object.fromEntries(codigos.map((g) => [g.inventoryId, claveCodigoMl(g.inventoryId)]));
  const pastilla = (activa: boolean) => `rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset ${activa ? "bg-[#2D3277] text-white ring-[#2D3277]" : "bg-white text-zinc-600 ring-zinc-300 hover:bg-zinc-50"}`;
  const [conexion, sync] = await Promise.all([obtenerConexion().catch(() => null), obtenerEstadoSync().catch(() => null)]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Ligar Mercado Libre con tus productos</h2>
        <p className="text-sm text-zinc-500">
          Cada producto en Full tiene su <strong>Código ML</strong> (el del panel de envíos y de tus etiquetas; tu publicación normal y la de catálogo comparten el mismo, y cada color tiene el suyo). Se liga una sola vez y todo el sistema usa esa liga: envíos a Full, ventas, valor en Full, Análisis y etiquetas.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3">
        <p className="text-xs text-zinc-500">
          Esta lista usa la última copia de tus publicaciones{sync?.ultima_sync_stock ? ` (${formatoFechaHoraMx(sync.ultima_sync_stock)})` : ""}: {totalPublicaciones.toLocaleString("es-MX")} publicaciones/variantes. Si acabas de cambiar SKUs o colores en Mercado Libre, o te faltan publicaciones, actualiza primero.
          {sync?.ultimo_error_stock && <span className="block text-amber-700">Último aviso de la sincronización: {sync.ultimo_error_stock}</span>}
        </p>
        <BotonSincronizarStock conectado={Boolean(conexion)} />
      </div>
      <RevisarFaltantes conectado={Boolean(conexion)} opciones={productos} />
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      <div className="flex flex-wrap gap-2">
        <Link href="/mercadolibre/skus" className={pastilla(!sinFull)}>
          Productos en Full · por Código ML{pendientesFull > 0 ? ` (${pendientesFull} por ligar)` : ""}
        </Link>
        <Link href="/mercadolibre/skus?vista=sinfull" className={pastilla(sinFull)}>
          Sin Full (Colecta, Flex…){pendientes > 0 ? ` (${pendientes} por ligar)` : ""}
        </Link>
      </div>
      {sinFull ? (
        <>
          <p className="text-xs text-zinc-500">Publicaciones que no están en Full (no tienen Código ML): se ligan por su SKU de ML o una por una, como antes.</p>
          <TablaSkus grupos={grupos} sinSku={sinSku} productos={productos} pendientes={pendientes} ignorados={ignorados} qInicial={q ?? ""} catalogo={catalogoParaNuevo} />
        </>
      ) : (
        <TablaCodigos grupos={codigos} opciones={productos} clavesOlvido={clavesOlvido} qInicial={q ?? ""} catalogo={catalogoParaNuevo} />
      )}
    </div>
  );
}

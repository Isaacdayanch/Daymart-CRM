import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/servicio";
import { obtenerConexion } from "@/lib/mercadolibre-auth";
import { claveVinculo, obtenerPublicaciones, obtenerVinculos, skuCrmDe } from "@/lib/mercadolibre-stock";
import { envioPromedioPorItem, obtenerCambiosPrecio, obtenerMargenMinimo } from "@/lib/mercadolibre-precios";
import type { OrdenItemMl, OrdenMl } from "@/lib/mercadolibre-ordenes";
import { resumenPorSku } from "@/lib/calculos-stock";
import { obtenerPiezasPorCajaPorSku } from "@/lib/productos-stock";
import type { ConfiguracionStock, MovimientoStock } from "@/lib/tipos";
import { TablaPrecios, type FilaPrecio } from "./tabla-precios";
import { Bitacora } from "./bitacora";
import { MargenMinimo } from "./margen-minimo";

export const maxDuration = 60;

const DIA_MS = 86400000;

/** Instante de hace N días (fuera del render, para el lint). */
function haceDias(n: number) {
  return new Date(Date.now() - n * DIA_MS).toISOString();
}

/** Precios con margen real: Isaac elige publicaciones, define el precio
 * nuevo (fijo, % o "que me deje X% de margen") y ve antes de aplicar
 * cuánto le queda por pieza con la comisión de ML, el envío promedio real
 * y el costo del CRM. Nada se cambia en ML hasta que confirma. */
export default async function PreciosMercadoLibre() {
  const supabase = await createClient();
  const conexion = await obtenerConexion().catch(() => null);

  const [{ data: movimientos }, { data: configuracion }, piezasPorCajaPorSku] = await Promise.all([
    supabase.from("movimientos_stock").select("*").returns<MovimientoStock[]>(),
    supabase.from("configuracion_stock").select("*").single<ConfiguracionStock>(),
    obtenerPiezasPorCajaPorSku(supabase),
  ]);
  const resumenes = resumenPorSku(movimientos ?? [], configuracion?.dias_espera ?? 60, piezasPorCajaPorSku);
  const skusCrm = new Set(resumenes.map((r) => r.sku));
  const costoPorSku = new Map(resumenes.map((r) => [r.sku, r.costoPromedio]));
  const nombrePorSku = new Map(resumenes.map((r) => [r.sku, r.nombre]));

  let filas: FilaPrecio[] = [];
  let errorLectura: string | null = null;
  let margenMinimo = 20;
  let cambios = await obtenerCambiosPrecio(40);
  let sinComision = 0;
  try {
    const servicio = createServiceClient();
    const desde = haceDias(90);
    const [publicaciones, vinculosLista, { data: ordenes }, minimo] = await Promise.all([
      obtenerPublicaciones(),
      obtenerVinculos(),
      servicio.from("mercadolibre_ordenes").select("*").eq("estado", "paid").gte("fecha_creacion", desde).limit(5000).returns<OrdenMl[]>(),
      obtenerMargenMinimo(),
    ]);
    margenMinimo = minimo;
    let items: OrdenItemMl[] = [];
    if (ordenes?.length) {
      const { data } = await servicio
        .from("mercadolibre_orden_items")
        .select("orden_id, item_id, cantidad")
        .in("orden_id", ordenes.map((o) => o.id))
        .returns<OrdenItemMl[]>();
      items = data ?? [];
    }
    const envioPorItem = envioPromedioPorItem(ordenes ?? [], items, 90);
    const vinculos = new Map(vinculosLista.map((v) => [claveVinculo(v.item_id, v.variation_id), v.sku_crm]));

    filas = publicaciones
      .filter((p) => p.estado === "active")
      .map((p) => {
        const { sku } = skuCrmDe(p, vinculos, skusCrm);
        const piezas = p.full_disponible ?? p.cantidad_publicada ?? 0;
        if (p.comision_pct === null || p.comision_pct === undefined) sinComision++;
        return {
          id: p.id,
          itemId: p.item_id,
          variationId: p.variation_id,
          titulo: p.titulo ?? p.item_id,
          variacion: p.variacion,
          imagenUrl: p.imagen_url,
          catalogo: p.catalogo,
          logistica: p.logistica,
          precio: p.precio ?? 0,
          precioOriginal: p.precio_original ?? null,
          comisionPct: p.comision_pct ?? null,
          comisionFija: p.comision_fija ?? 0,
          envio: envioPorItem.get(p.item_id) ?? null,
          costo: sku ? (costoPorSku.get(sku) ?? null) : null,
          skuCrm: sku,
          nombreCrm: sku ? (nombrePorSku.get(sku) ?? null) : null,
          piezas,
          valor: (p.precio ?? 0) * piezas,
        };
      })
      .sort((a, b) => b.valor - a.valor);
  } catch (e) {
    errorLectura = e instanceof Error ? e.message : "No se pudieron leer las publicaciones.";
  }
  cambios = cambios ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Precios con margen real</h2>
          <p className="text-sm text-zinc-500">
            Elige publicaciones, pon el precio nuevo y ve cuánto te queda por pieza antes de aplicarlo en Mercado Libre. Nada cambia hasta que confirmes.
          </p>
        </div>
        <MargenMinimo valor={margenMinimo} />
      </div>

      {!conexion && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Mercado Libre no está conectado. Ve a <Link href="/mercadolibre/conexion" className="underline">Conexión</Link>.
        </div>
      )}
      {errorLectura && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorLectura}</div>}
      {filas.length > 0 && sinComision === filas.length && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Todavía no tengo la comisión de Mercado Libre de tus publicaciones. Corre el SQL 0040 en Supabase y luego dale a “Actualizar desde Mercado Libre” en{" "}
          <Link href="/mercadolibre/stock" className="underline">Publicaciones</Link> — la comisión se guarda con cada publicación al sincronizar.
        </div>
      )}

      {filas.length === 0 && !errorLectura ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <p className="text-base font-medium text-zinc-900">No hay publicaciones activas guardadas</p>
          <p className="mt-1 text-sm text-zinc-500">
            Sincroniza primero en <Link href="/mercadolibre/stock" className="underline">Publicaciones</Link>.
          </p>
        </div>
      ) : (
        <TablaPrecios filas={filas} margenMinimo={margenMinimo} />
      )}

      <Bitacora cambios={cambios} />

      <p className="text-xs text-zinc-400">
        “Comisión” es la de Mercado Libre para esa categoría y tipo de publicación al precio actual (se consulta al sincronizar; al aplicar un precio se vuelve a consultar
        con el precio nuevo). “Envío” es el promedio real que pagaste por pieza en las ventas de esa publicación en los últimos 90 días (0 si el comprador lo paga; “—” si no
        hay ventas con dato). “Costo” es el costo promedio del producto del CRM ligado — sin liga no hay margen. “Te queda” = precio − comisión − envío − costo.
      </p>
    </div>
  );
}

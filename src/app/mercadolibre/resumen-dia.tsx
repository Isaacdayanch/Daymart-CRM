import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/servicio";
import { obtenerConexion } from "@/lib/mercadolibre-auth";
import { claveVinculo, obtenerPublicaciones, obtenerVinculos, skuCrmDe, type PublicacionMl } from "@/lib/mercadolibre-stock";
import { envioPromedioPorItem, obtenerMargenMinimo, piezasVendidasPorItem, preguntasSinResponder } from "@/lib/mercadolibre-precios";
import { margenPublicacion } from "@/lib/mercadolibre-margen";
import type { OrdenItemMl, OrdenMl } from "@/lib/mercadolibre-ordenes";
import { resumenPorSku } from "@/lib/calculos-stock";
import { obtenerPiezasPorCajaPorSku } from "@/lib/productos-stock";
import { formatoPesos } from "@/lib/formato";
import type { ConfiguracionStock, MovimientoStock } from "@/lib/tipos";

const DIA_MS = 86400000;
/** Se avisa cuando el stock en Full alcanza para menos de estos días. */
const DIAS_AVISO_FULL = 14;
const DIAS_SIN_VENTAS = 14;

/** Instante de hace N días (fuera del render, para el lint). */
function haceDias(n: number) {
  return new Date(Date.now() - n * DIA_MS).toISOString();
}

function Tarjeta({ titulo, color, children }: { titulo: React.ReactNode; color: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${color}`}>
      <p className="text-xs font-semibold">{titulo}</p>
      <div className="mt-2 space-y-1.5">{children}</div>
    </div>
  );
}
function Renglon({ p, derecha }: { p: PublicacionMl; derecha: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {p.imagen_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- miniatura de Mercado Libre
        <img src={p.imagen_url} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" />
      ) : (
        <div className="h-7 w-7 shrink-0 rounded-md bg-white/60" />
      )}
      <p className="min-w-0 flex-1 truncate text-zinc-800" title={p.titulo ?? ""}>
        {p.titulo}
        {p.variacion && <span className="text-zinc-500"> · {p.variacion}</span>}
      </p>
      <p className="shrink-0 text-right font-medium text-zinc-900">{derecha}</p>
    </div>
  );
}


/** Resumen del día al abrir Mercado Libre: dónde actuar hoy. Solo lo que
 * tenga algo que decir; si todo está bien, no estorba. */
export async function ResumenDia() {
  let publicaciones: PublicacionMl[] = [];
  let ordenes: OrdenMl[] = [];
  let items: OrdenItemMl[] = [];
  let vinculos = new Map<string, string>();
  let margenMinimo = 20;
  let preguntas: number | null = null;
  const supabase = await createClient();
  try {
    const servicio = createServiceClient();
    const desde = haceDias(90);
    const [pubs, vins, { data: ords }, minimo, conexion] = await Promise.all([
      obtenerPublicaciones(),
      obtenerVinculos(),
      servicio.from("mercadolibre_ordenes").select("*").eq("estado", "paid").gte("fecha_creacion", desde).limit(5000).returns<OrdenMl[]>(),
      obtenerMargenMinimo().catch(() => 20),
      obtenerConexion().catch(() => null),
    ]);
    publicaciones = pubs;
    vinculos = new Map(vins.map((v) => [claveVinculo(v.item_id, v.variation_id), v.sku_crm]));
    ordenes = ords ?? [];
    margenMinimo = minimo;
    if (ordenes.length) {
      const { data } = await servicio
        .from("mercadolibre_orden_items")
        .select("orden_id, item_id, cantidad")
        .in("orden_id", ordenes.map((o) => o.id))
        .returns<OrdenItemMl[]>();
      items = data ?? [];
    }
    if (conexion) preguntas = await preguntasSinResponder(conexion.ml_user_id);
  } catch {
    return null;
  }
  if (publicaciones.length === 0) return null;

  const [{ data: movimientos }, { data: configuracion }, piezasPorCajaPorSku] = await Promise.all([
    supabase.from("movimientos_stock").select("*").returns<MovimientoStock[]>(),
    supabase.from("configuracion_stock").select("*").single<ConfiguracionStock>(),
    obtenerPiezasPorCajaPorSku(supabase),
  ]);
  const resumenes = resumenPorSku(movimientos ?? [], configuracion?.dias_espera ?? 60, piezasPorCajaPorSku);
  const skusCrm = new Set(resumenes.map((r) => r.sku));
  const costoPorSku = new Map(resumenes.map((r) => [r.sku, r.costoPromedio]));
  const stockPorSku = new Map(resumenes.map((r) => [r.sku, r.stockActual]));

  const activas = publicaciones.filter((p) => p.estado === "active");
  const vendidas30 = piezasVendidasPorItem(ordenes, items, 30);
  const vendidas14 = piezasVendidasPorItem(ordenes, items, DIAS_SIN_VENTAS);
  const envioPorItem = envioPromedioPorItem(ordenes, items, 90);

  // 1) Full por acabarse: piezas en Full ÷ (vendidas en 30 días ÷ 30).
  const vistosFull = new Set<string>();
  const porAcabarse = activas
    .filter((p) => p.logistica === "Full" && p.inventory_id && p.full_disponible !== null)
    .filter((p) => {
      if (vistosFull.has(p.inventory_id!)) return false;
      vistosFull.add(p.inventory_id!);
      return true;
    })
    .map((p) => {
      const rotacion = (vendidas30.get(p.item_id) ?? 0) / 30;
      const dias = rotacion > 0 ? (p.full_disponible ?? 0) / rotacion : Infinity;
      const { sku } = skuCrmDe(p, vinculos, skusCrm);
      return { p, rotacion, dias, enBodega: sku ? (stockPorSku.get(sku) ?? 0) : null };
    })
    .filter((x) => x.rotacion > 0 && x.dias <= DIAS_AVISO_FULL)
    .sort((a, b) => a.dias - b.dias);

  // 2) Sin ventas en 14 días (con stock).
  const sinVentas = activas
    .filter((p) => (p.full_disponible ?? p.cantidad_publicada ?? 0) > 0 && !(vendidas14.get(p.item_id) ?? 0))
    .map((p) => ({ p, valor: (p.precio ?? 0) * (p.full_disponible ?? p.cantidad_publicada ?? 0) }))
    .sort((a, b) => b.valor - a.valor);

  // 3) Abajo del margen mínimo (solo con comisión sincronizada y producto ligado).
  const abajoMargen = activas
    .map((p) => {
      const { sku } = skuCrmDe(p, vinculos, skusCrm);
      if (!sku || p.comision_pct === null || p.comision_pct === undefined || !p.precio) return null;
      const m = margenPublicacion({ precio: p.precio, comisionPct: p.comision_pct, comisionFija: p.comision_fija ?? 0, envio: envioPorItem.get(p.item_id) ?? 0, costo: costoPorSku.get(sku) ?? 0 });
      return m.pct < margenMinimo ? { p, m } : null;
    })
    .filter((x): x is { p: PublicacionMl; m: ReturnType<typeof margenPublicacion> } => x !== null)
    .sort((a, b) => a.m.pct - b.m.pct);

  const nada = porAcabarse.length === 0 && sinVentas.length === 0 && abajoMargen.length === 0 && !preguntas;
  if (nada) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">Para hoy</h2>
        <p className="text-[11px] text-zinc-400">Dónde conviene actuar, según tus ventas y tu stock</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {porAcabarse.length > 0 && (
          <Tarjeta titulo={<span className="text-[#2D3277]">Full se va a quedar sin stock ({porAcabarse.length})</span>} color="border-[#2D3277]/20 bg-[#2D3277]/5">
            {porAcabarse.slice(0, 6).map(({ p, dias, enBodega }) => (
              <Renglon
                key={p.id}
                p={p}
                derecha={
                  <>
                    {p.full_disponible} en Full · ~{Math.max(0, Math.floor(dias))} días
                    {enBodega !== null && <span className="block text-[10px] font-normal text-zinc-500">{enBodega.toLocaleString("es-MX")} en bodega</span>}
                  </>
                }
              />
            ))}
            <Link href="/stock/full" className="block pt-1 text-[11px] text-[#2D3277] underline-offset-2 hover:underline">
              Armar envío a Full →
            </Link>
          </Tarjeta>
        )}
        {abajoMargen.length > 0 && (
          <Tarjeta titulo={<span className="text-red-800">Abajo de tu margen mínimo de {margenMinimo}% ({abajoMargen.length})</span>} color="border-red-200 bg-red-50">
            {abajoMargen.slice(0, 6).map(({ p, m }) => (
              <Renglon
                key={p.id}
                p={p}
                derecha={
                  <>
                    {formatoPesos(p.precio ?? 0)} <span className="text-red-700">· te queda {m.pct.toFixed(1)}%</span>
                  </>
                }
              />
            ))}
            <Link href="/mercadolibre/precios" className="block pt-1 text-[11px] text-red-800 underline-offset-2 hover:underline">
              Revisar precios →
            </Link>
          </Tarjeta>
        )}
        {sinVentas.length > 0 && (
          <Tarjeta titulo={<span className="text-amber-800">Sin ventas en {DIAS_SIN_VENTAS} días, con stock ({sinVentas.length})</span>} color="border-amber-200 bg-amber-50">
            {sinVentas.slice(0, 6).map(({ p, valor }) => (
              <Renglon key={p.id} p={p} derecha={<>{formatoPesos(valor)} parados</>} />
            ))}
            <Link href="/mercadolibre/precios" className="block pt-1 text-[11px] text-amber-800 underline-offset-2 hover:underline">
              Bajar precio o promocionar →
            </Link>
          </Tarjeta>
        )}
        {preguntas ? (
          <Tarjeta titulo={<span className="text-emerald-800">Preguntas sin responder</span>} color="border-emerald-200 bg-emerald-50">
            <p className="text-2xl font-semibold text-emerald-900">{preguntas}</p>
            <p className="text-[11px] text-emerald-800">Respóndelas en la app de Mercado Libre (responder desde el CRM viene después).</p>
          </Tarjeta>
        ) : null}
      </div>
    </section>
  );
}

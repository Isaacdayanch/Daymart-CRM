import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { analisisVentasMl } from "@/lib/mercadolibre-analisis";
import { formatoFechaMx } from "@/lib/fechas-mx";
import { periodoAnalisis } from "./periodo";
import { TablaAnalisis } from "./tabla-analisis";
import { FiltroAnalisis } from "./filtro-analisis";
import type { Contenedor } from "@/lib/tipos";

export const maxDuration = 60;

/** Análisis de venta: ventas por día DISPONIBLE (activa y con stock), no
 * por día de calendario, para calcular la reorden (Isaac, 6 oct). */
export default async function AnalisisVenta({ searchParams }: { searchParams: Promise<{ dias?: string; desde?: string; hasta?: string }> }) {
  const params = await searchParams;
  const { desde, hasta, dias } = periodoAnalisis(params);
  const supabase = await createClient();
  const [resultado, { data: enConfiguracion }] = await Promise.all([
    analisisVentasMl(supabase, desde, hasta),
    supabase.from("contenedores").select("id, numero").eq("estado", "CONFIGURANDOSE").is("eliminado_en", null).order("numero", { ascending: false }).limit(1).maybeSingle<Pick<Contenedor, "id" | "numero">>(),
  ]);
  const query = dias ? `?dias=${dias}` : `?desde=${params.desde}&hasta=${params.hasta}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Análisis de venta</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-zinc-500">
            Las ventas se dividen entre los días en que el producto estuvo <strong>disponible</strong> (activo y con stock), no entre los días del mes. Así sabes cuánto vende de verdad por día y cuánto pedir para cubrir
            los {resultado.diasEspera} días que tarda un pedido nuevo (Stock → Configuración).
          </p>
        </div>
        <a href={`/mercadolibre/analisis/exportar${query}`} className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
          Descargar Excel
        </a>
      </div>

      <FiltroAnalisis dias={dias} desde={params.desde ?? ""} hasta={params.hasta ?? ""} />

      {resultado.faltaSql && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Falta correr el SQL 0046 en Supabase: mientras, el sistema no puede guardar las &ldquo;fotos&rdquo; de las publicaciones y los días disponibles se aproximan con los días que tuvieron ventas.
        </div>
      )}
      {!resultado.faltaSql && resultado.primeraFoto && new Date(resultado.primeraFoto) > desde && (
        <p className="text-xs text-zinc-500">
          Las fotos de las publicaciones empezaron el {formatoFechaMx(resultado.primeraFoto)}. Antes de esa fecha, los días disponibles se aproximan con los días que tuvieron al menos una venta (marcados en gris en la línea de tiempo).
        </p>
      )}
      {!resultado.faltaSql && !resultado.primeraFoto && (
        <p className="text-xs text-zinc-500">Todavía no hay fotos guardadas: se van a ir tomando solas con cada revisión del reloj (cada hora). Mientras, los días disponibles se aproximan con los días que tuvieron ventas.</p>
      )}

      <TablaAnalisis filas={resultado.filas} diasEspera={resultado.diasEspera} contenedor={enConfiguracion ?? null} />

      <p className="text-[11px] text-zinc-400">
        Ventas por día = piezas vendidas ÷ días disponible · Proyección = ventas por día × 30 · Te alcanza = stock de hoy (bodega + Full) ÷ ventas por día · Sugerido pedir = ventas por día × {resultado.diasEspera} días − stock de hoy. Un producto sin ventas ni disponibilidad en el periodo no aparece. Si quieres cambiar los días de espera, ve a{" "}
        <Link href="/stock/configuracion" className="underline-offset-2 hover:underline">
          Stock → Configuración
        </Link>
        .
      </p>
    </div>
  );
}

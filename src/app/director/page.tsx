import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatoFechaHoraMx } from "@/lib/fechas-mx";
import { ACCIONES_DIRECTOR, ETIQUETA_AREA, ETIQUETA_ESTADO, ordenarPropuestas } from "@/lib/director";
import type { BitacoraDirector, PropuestaDirector } from "@/lib/tipos";
import { BotonGuardar } from "@/components/boton-guardar";
import { PropuestasPendientes } from "./propuestas-pendientes";
import { deshacerDecisionForm, marcarHechaForm } from "./actions";

const DIA_MS = 86400000;

/** Instante de hace N días (fuera del render, para el lint). */
function haceDias(n: number) {
  return new Date(Date.now() - n * DIA_MS).toISOString();
}

function precioDe(p: PropuestaDirector) {
  const precio = p.precio_aprobado ?? p.precio_propuesto;
  return precio === null || precio === undefined ? null : `$${Number(precio).toLocaleString("es-MX")}`;
}

function estiloEstado(estado: PropuestaDirector["estado"]) {
  if (estado === "APROBADA") return "bg-[#2D3277]/10 text-[#2D3277]";
  if (estado === "EJECUTADA") return "bg-emerald-100 text-emerald-800";
  if (estado === "RECHAZADA") return "bg-zinc-100 text-zinc-600";
  if (estado === "FALLIDA") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-800";
}

/** Pantalla del Director (solo dueño): lo que propuso hoy el agente, lo que
 * Isaac ya aprobó y falta ejecutar, el historial y la bitácora. Isaac decide
 * aquí desde el celular; el Director lee las decisiones por `/api/director`.
 * Fase 1: las aprobadas se marcan "hecha" a mano; en la fase 2 el CRM las
 * ejecuta en Mercado Libre. */
export default async function DirectorPage() {
  const supabase = await createClient();
  const hace30 = haceDias(30);
  const [{ data: pendientes, error }, { data: aprobadas }, { data: historial }, { data: bitacora }] = await Promise.all([
    supabase.from("director_propuestas").select("*").eq("estado", "PROPUESTA").order("fecha", { ascending: false }).order("orden").returns<PropuestaDirector[]>(),
    supabase.from("director_propuestas").select("*").eq("estado", "APROBADA").order("fecha", { ascending: false }).order("orden").returns<PropuestaDirector[]>(),
    supabase
      .from("director_propuestas")
      .select("*")
      .in("estado", ["RECHAZADA", "EJECUTADA", "FALLIDA", "CADUCADA"])
      .gte("creado_en", hace30)
      .order("decidido_en", { ascending: false, nullsFirst: false })
      .limit(200)
      .returns<PropuestaDirector[]>(),
    supabase.from("director_bitacora").select("*").order("creado_en", { ascending: false }).limit(40).returns<BitacoraDirector[]>(),
  ]);
  const faltaSql = Boolean(error && /director_propuestas/.test(error.message) && /does not exist|schema cache/i.test(error.message));
  const ultimaCorrida = (bitacora ?? []).find((b) => b.origen === "DIRECTOR" && b.accion === "PROPUESTAS");
  const listaPendientes = ordenarPropuestas(pendientes ?? []);
  const listaAprobadas = ordenarPropuestas(aprobadas ?? []);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Lo que el Director te propone</h2>
          <p className="text-sm text-zinc-500">
            Cada mañana a las 8:25 el Director revisa tu cuenta de Mercado Libre y deja aquí sus propuestas. Tú decides; nada se ejecuta sin tu aprobación.
            {ultimaCorrida && <> Última corrida: {formatoFechaHoraMx(ultimaCorrida.creado_en)}.</>}
          </p>
        </div>
        <Link href="/mercadolibre" className="text-xs text-zinc-500 underline-offset-2 hover:underline">
          Ver Mercado Libre →
        </Link>
      </div>

      {faltaSql && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Falta correr el SQL 0055 en Supabase para que exista la pantalla del Director.
        </div>
      )}
      {error && !faltaSql && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error.message}</div>}

      {!faltaSql && listaPendientes.length === 0 && listaAprobadas.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center">
          <p className="text-base font-medium text-zinc-900">No hay propuestas pendientes</p>
          <p className="mt-1 text-sm text-zinc-500">Mañana a las 8:25 el Director deja aquí lo que toca. También puedes decirle en el chat “revisa la cuenta de Meli”.</p>
        </div>
      )}

      <PropuestasPendientes propuestas={listaPendientes} />

      {listaAprobadas.length > 0 && (
        <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-900">
              Aprobadas, falta hacerlas <span className="font-normal text-zinc-400">· {listaAprobadas.length}</span>
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Por ahora las haces tú en Mercado Libre (o el Director con tu Chrome) y aquí las marcas como hechas. Cuando el CRM pueda ejecutarlas solo, aquí mismo verás “hecha por el
              CRM”.
            </p>
          </div>
          <ul className="divide-y divide-zinc-100">
            {listaAprobadas.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <span className="w-7 shrink-0 text-xs font-semibold text-zinc-400">#{p.orden}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900">
                    {p.titulo}
                    {precioDe(p) && <span className="ml-2 text-[#2D3277]">{precioDe(p)}</span>}
                    {p.precio_aprobado !== null && p.precio_aprobado !== p.precio_propuesto && (
                      <span className="ml-1 text-[11px] text-amber-700">(cambiaste el precio; propuesto ${Number(p.precio_propuesto ?? 0).toLocaleString("es-MX")})</span>
                    )}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    {ETIQUETA_AREA[p.area]} · {ACCIONES_DIRECTOR[p.accion_tipo]?.etiqueta ?? p.accion_tipo} · aprobada {p.decidido_en ? formatoFechaHoraMx(p.decidido_en) : ""}
                    {p.decidido_desde === "CHAT" && " desde el chat"}
                  </p>
                  {p.detalle && <p className="mt-0.5 text-xs text-zinc-600">{p.detalle}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <form action={deshacerDecisionForm.bind(null, p.id)}>
                    <button type="submit" className="text-[11px] text-zinc-400 underline-offset-2 hover:text-zinc-700 hover:underline">
                      regresar
                    </button>
                  </form>
                  <form action={marcarHechaForm.bind(null, p.id)} className="flex items-center gap-1">
                    <input name="resultado" placeholder="nota (opcional)" className="w-28 rounded-lg border border-zinc-200 px-2 py-1 text-xs" />
                    <BotonGuardar textoCargando="Guardando…" textoListo="Hecha" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                      Ya la hice
                    </BotonGuardar>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(historial ?? []).length > 0 && (
        <details className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-zinc-900">
            Historial de los últimos 30 días <span className="font-normal text-zinc-400">· {historial!.length}</span>
          </summary>
          <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
            {historial!.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start gap-3 px-4 py-2.5 text-xs">
                <span className="w-20 shrink-0 text-zinc-400">{p.fecha.slice(5)}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${estiloEstado(p.estado)}`}>{ETIQUETA_ESTADO[p.estado]}</span>
                <span className="min-w-0 flex-1 text-zinc-800">
                  #{p.orden} {p.titulo}
                  {precioDe(p) && <span className="text-zinc-500"> · {precioDe(p)}</span>}
                  <span className="text-zinc-400"> · {ETIQUETA_AREA[p.area]}</span>
                  {p.resultado && <span className="block text-[11px] text-zinc-500">{p.resultado}</span>}
                  {p.error && <span className="block text-[11px] text-red-700">{p.error}</span>}
                </span>
                {p.estado === "RECHAZADA" && (
                  <form action={deshacerDecisionForm.bind(null, p.id)}>
                    <button type="submit" className="text-[11px] text-zinc-400 underline-offset-2 hover:text-zinc-700 hover:underline">
                      regresar
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {(bitacora ?? []).length > 0 && (
        <details className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-zinc-900">
            Bitácora <span className="font-normal text-zinc-400">· últimas {bitacora!.length}</span>
          </summary>
          <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
            {bitacora!.map((b) => (
              <li key={b.id} className="flex flex-wrap items-start gap-3 px-4 py-2 text-xs">
                <span className="w-32 shrink-0 text-zinc-400">{formatoFechaHoraMx(b.creado_en)}</span>
                <span className="w-16 shrink-0 font-medium text-zinc-500">{b.origen === "ISAAC" ? "Tú" : b.origen === "CRM" ? "CRM" : "Director"}</span>
                <span className="min-w-0 flex-1 text-zinc-800">
                  {b.accion}
                  {b.resultado && <span className="text-zinc-500"> · {b.resultado}</span>}
                  {b.error && <span className="block text-red-700">{b.error}</span>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-xs text-zinc-400">
        El Director propone y tú decides; sus reglas (qué productos no se tocan, precios fijos, márgenes) viven en su manual y crecen con lo que le digas. Si quieres que una tarea la
        haga sin preguntar, díselo en el chat y se anota como “hacer y avisar”.
      </p>
    </div>
  );
}

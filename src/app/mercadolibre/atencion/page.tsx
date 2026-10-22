import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/servicio";
import { obtenerConexion } from "@/lib/mercadolibre-auth";
import { iaConfigurada } from "@/lib/ia-respuestas";
import { faltaSqlAtencion, gastoIaHoy, LIMITE_DIARIO_DEFAULT, obtenerConfigAtencion, type ConfigAtencion, type PreguntaMl } from "@/lib/mercadolibre-preguntas";
import { COSTO_MAXIMO_RESPUESTA } from "@/lib/ia-respuestas";
import { formatoFechaHoraMx } from "@/lib/fechas-mx";
import { ActualizarBandeja } from "./actualizar-bandeja";
import { TarjetaPregunta, type ProductoDePregunta } from "./tarjeta-pregunta";
import { ReglasCasa } from "./reglas-casa";
import { PanelWhatsapp } from "./panel-whatsapp";
import { TopeDiario } from "./tope-diario";
import { VolverABandeja } from "./volver-a-bandeja";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

interface PubFila {
  item_id: string;
  titulo: string | null;
  variacion: string | null;
  imagen_url: string | null;
  precio: number | null;
  logistica: string | null;
  full_disponible: number | null;
  cantidad_publicada: number | null;
  catalogo: boolean;
}

/** Atención a clientes — Fase 1: preguntas de compradores. La IA redacta
 * un borrador para cada una y Isaac lo aprueba, lo corrige o lo descarta.
 * Nada se manda a Mercado Libre sin su clic. */
export default async function AtencionClientes() {
  const supabase = createServiceClient();
  const [conexion, pendientes, respondidas, descartadas, config, gastoHoy] = await Promise.all([
    obtenerConexion().catch(() => null),
    supabase.from("mercadolibre_preguntas").select("*").eq("estado", "PENDIENTE").order("fecha_creacion", { ascending: true }).limit(200).returns<PreguntaMl[]>(),
    supabase.from("mercadolibre_preguntas").select("*").eq("estado", "RESPONDIDA").order("respondida_en", { ascending: false, nullsFirst: false }).limit(30).returns<PreguntaMl[]>(),
    supabase.from("mercadolibre_preguntas").select("*").eq("estado", "DESCARTADA").order("fecha_creacion", { ascending: false }).limit(20).returns<PreguntaMl[]>(),
    obtenerConfigAtencion().catch((): ConfigAtencion => ({ reglas: null, whatsapp_telefono: null, whatsapp_apikey: null, limite_diario_usd: LIMITE_DIARIO_DEFAULT })),
    gastoIaHoy().catch(() => 0),
  ]);

  const faltaSql = faltaSqlAtencion(pendientes.error?.message);
  const listaPendientes = pendientes.data ?? [];
  const listaRespondidas = respondidas.data ?? [];
  const listaDescartadas = descartadas.data ?? [];

  const itemIds = Array.from(new Set([...listaPendientes, ...listaRespondidas, ...listaDescartadas].map((p) => p.item_id)));
  const { data: pubs } = itemIds.length
    ? await supabase
        .from("mercadolibre_publicaciones")
        .select("item_id, titulo, variacion, imagen_url, precio, logistica, full_disponible, cantidad_publicada, catalogo")
        .in("item_id", itemIds)
        .returns<PubFila[]>()
    : { data: [] as PubFila[] };
  const productoDe = new Map<string, ProductoDePregunta>();
  for (const id of itemIds) {
    const filas = (pubs ?? []).filter((p) => p.item_id === id);
    const principal = filas.find((p) => !p.catalogo) ?? filas[0];
    productoDe.set(id, {
      titulo: principal?.titulo ?? id,
      imagenUrl: filas.find((p) => p.imagen_url)?.imagen_url ?? null,
      precio: principal?.precio ?? null,
      variantes: filas
        .filter((p) => p.variacion)
        .map((p) => ({
          variacion: p.variacion!,
          disponible: p.logistica === "fulfillment" ? (p.full_disponible ?? 0) : (p.cantidad_publicada ?? 0),
        })),
      disponible: filas.reduce((s, p) => s + (p.logistica === "fulfillment" ? (p.full_disponible ?? 0) : (p.cantidad_publicada ?? 0)), 0),
      enFull: filas.some((p) => p.logistica === "fulfillment"),
    });
  }

  const sinBorrador = listaPendientes.filter((p) => !p.borrador).length;
  const hoy = new Date().toLocaleDateString("es-MX", {
    timeZone: "America/Mexico_City",
  });
  const respondidasHoy = listaRespondidas.filter(
    (p) =>
      p.respondida_en &&
      new Date(p.respondida_en).toLocaleDateString("es-MX", {
        timeZone: "America/Mexico_City",
      }) === hoy,
  ).length;
  const ia = iaConfigurada();
  // Si ya no alcanza para una respuesta más, hoy las contesta Isaac a mano.
  const topeAlcanzado = gastoHoy + COSTO_MAXIMO_RESPUESTA > config.limite_diario_usd;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-3xl font-semibold tracking-tight text-zinc-900">Atención a clientes</h2>
        <p className="mt-1 text-sm text-zinc-500">Las preguntas de tus compradores con su respuesta ya redactada. Tú solo revisas y le das enviar.</p>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <Tarjeta numero={listaPendientes.length} etiqueta="Por responder" resaltar={listaPendientes.length > 0} />
          <Tarjeta numero={respondidasHoy} etiqueta="Respondidas hoy" />
          <Tarjeta numero={sinBorrador} etiqueta="Redactándose" />
        </div>
      </section>

      {faltaSql && (
        <Aviso>
          Falta correr el SQL <b>0057</b> en Supabase para que funcione esta pestaña.
        </Aviso>
      )}
      {!conexion && (
        <Aviso>
          Mercado Libre no está conectado.{" "}
          <Link href="/mercadolibre/conexion" className="font-medium underline">
            Conectar →
          </Link>
        </Aviso>
      )}
      {!ia && !faltaSql && (
        <Aviso>
          Falta la llave de la IA (<span className="font-mono">ANTHROPIC_API_KEY</span>) en Vercel: mientras, las preguntas llegan aquí pero sin borrador y las contestas tú.
        </Aviso>
      )}

      {ia && !faltaSql && topeAlcanzado && (
        <Aviso>
          Hoy ya se usó el tope de <b>${config.limite_diario_usd.toFixed(2)} USD</b> en la IA (llevas ${gastoHoy.toFixed(2)}). Las preguntas siguen llegando aquí: contéstalas tú, o mañana se redactan solas.
        </Aviso>
      )}

      {!faltaSql && conexion && <ActualizarBandeja />}

      {!faltaSql && (
        <section className="space-y-4">
          {listaPendientes.length === 0 ? (
            <div className="rounded-3xl border border-zinc-200 bg-white p-10 text-center">
              <p className="text-4xl">🎉</p>
              <p className="mt-2 text-lg font-semibold text-zinc-900">No hay preguntas por responder</p>
              <p className="text-sm text-zinc-500">Cuando un comprador pregunte algo, aparece aquí con su respuesta lista.</p>
            </div>
          ) : (
            listaPendientes.map((p) => <TarjetaPregunta key={p.id} pregunta={p} producto={productoDe.get(p.item_id)!} fecha={formatoFechaHoraMx(p.fecha_creacion)} iaLista={ia && !topeAlcanzado} />)
          )}
        </section>
      )}

      {!faltaSql && (
        <section className="space-y-3">
          <ReglasCasa reglas={config.reglas} />
          {ia && <TopeDiario gastoHoy={gastoHoy} limite={config.limite_diario_usd} />}
          <PanelWhatsapp telefono={config.whatsapp_telefono} />
        </section>
      )}

      {listaRespondidas.length > 0 && (
        <details className="rounded-3xl border border-zinc-200 bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-900">Respondidas recientemente ({listaRespondidas.length})</summary>
          <ul className="mt-4 divide-y divide-zinc-100">
            {listaRespondidas.map((p) => (
              <li key={p.id} className="py-3 text-sm">
                <p className="text-xs text-zinc-400">
                  {productoDe.get(p.item_id)?.titulo} · {p.respondida_en ? formatoFechaHoraMx(p.respondida_en) : ""}
                  {p.respondida_por === "ml" && " · contestada en Mercado Libre"}
                  {p.editada && <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700">la corregiste: la IA aprende de esto</span>}
                </p>
                <p className="mt-1 text-zinc-900">❓ {p.texto}</p>
                <p className="mt-1 text-zinc-600">↳ {p.respuesta_enviada}</p>
              </li>
            ))}
          </ul>
        </details>
      )}

      {listaDescartadas.length > 0 && (
        <details className="rounded-3xl border border-zinc-200 bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-900">Quitadas sin contestar ({listaDescartadas.length})</summary>
          <ul className="mt-4 divide-y divide-zinc-100">
            {listaDescartadas.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="text-xs text-zinc-400">{productoDe.get(p.item_id)?.titulo}</p>
                  <p className="text-zinc-700">{p.texto}</p>
                </div>
                <VolverABandeja id={p.id} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Tarjeta({ numero, etiqueta, resaltar = false }: { numero: number; etiqueta: string; resaltar?: boolean }) {
  return (
    <div className={`rounded-3xl border p-4 ${resaltar ? "border-amber-200 bg-amber-50" : "border-zinc-200 bg-white"}`}>
      <p className={`text-3xl font-semibold tracking-tight ${resaltar ? "text-amber-700" : "text-zinc-900"}`}>{numero}</p>
      <p className="text-xs text-zinc-500">{etiqueta}</p>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{children}</div>;
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BotonGuardar } from "@/components/boton-guardar";
import { problemaEnRespuesta } from "@/lib/respuestas-ml";
import type { PreguntaMl } from "@/lib/mercadolibre-preguntas";
import { descartar, enviarRespuesta, volverARedactar } from "./actions";

export interface ProductoDePregunta {
  titulo: string;
  imagenUrl: string | null;
  precio: number | null;
  variantes: { variacion: string; disponible: number }[];
  disponible: number;
  enFull: boolean;
}

const CONFIANZA: Record<string, { texto: string; clase: string }> = {
  alta: { texto: "Segura", clase: "bg-emerald-100 text-emerald-700" },
  media: { texto: "Revísala", clase: "bg-amber-100 text-amber-700" },
  baja: { texto: "Necesita tu ojo", clase: "bg-red-100 text-red-700" },
};

const CATEGORIA: Record<string, string> = {
  disponibilidad: "Disponibilidad",
  medidas: "Medidas",
  envio: "Envío",
  precio: "Precio / descuento",
  garantia: "Garantía",
  uso: "Uso",
  factura: "Factura",
  compatibilidad: "Compatibilidad",
  otro: "Otra",
};

/** Una pregunta de la bandeja con su borrador listo para aprobar. */
export function TarjetaPregunta({ pregunta: p, producto, fecha, iaLista }: { pregunta: PreguntaMl; producto: ProductoDePregunta; fecha: string; iaLista: boolean }) {
  const router = useRouter();
  const [texto, setTexto] = useState(p.borrador ?? "");
  const [enviando, setEnviando] = useState(false);
  const [redactando, setRedactando] = useState(false);
  const [indicando, setIndicando] = useState(false);
  const [indicacion, setIndicacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const problema = texto.trim() ? problemaEnRespuesta(texto) : null;
  const confianza = p.confianza ? CONFIANZA[p.confianza] : null;
  const esperandoBorrador = iaLista && !p.borrador && !p.borrador_error;

  async function enviar() {
    setEnviando(true);
    setError(null);
    const r = await enviarRespuesta(p.id, texto);
    setEnviando(false);
    if (r.error) setError(r.error);
    else router.refresh();
  }

  async function redactar() {
    setRedactando(true);
    setError(null);
    const r = await volverARedactar(p.id, indicacion);
    setRedactando(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setIndicando(false);
    setIndicacion("");
    router.refresh();
  }

  // Cuando llega un borrador nuevo del servidor (redactado o vuelto a
  // redactar) se reemplaza lo que hay en el cuadro.
  const [borradorVisto, setBorradorVisto] = useState(p.borrador);
  if (p.borrador !== borradorVisto) {
    setBorradorVisto(p.borrador);
    setTexto(p.borrador ?? "");
  }

  return (
    <article className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex gap-4 border-b border-zinc-100 bg-zinc-50/60 p-4">
        {producto.imagenUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={producto.imagenUrl} alt="" className="h-16 w-16 shrink-0 rounded-2xl bg-white object-contain" />
        ) : (
          <div className="h-16 w-16 shrink-0 rounded-2xl bg-zinc-100" />
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium text-zinc-900">{producto.titulo}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            {producto.precio !== null && <span className="text-zinc-500">${producto.precio.toLocaleString("es-MX")}</span>}
            {producto.variantes.length ? (
              producto.variantes.map((v) => (
                <span key={v.variacion} className={`rounded-full px-2 py-0.5 ${v.disponible > 0 ? "bg-white text-zinc-600 ring-1 ring-zinc-200" : "bg-red-50 text-red-600"}`}>
                  {v.variacion}: {v.disponible > 0 ? v.disponible : "agotado"}
                </span>
              ))
            ) : (
              <span className={`rounded-full px-2 py-0.5 ${producto.disponible > 0 ? "bg-white text-zinc-600 ring-1 ring-zinc-200" : "bg-red-50 text-red-600"}`}>
                {producto.disponible > 0 ? `${producto.disponible} disponibles` : "agotado"}
              </span>
            )}
            {producto.enFull && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">Full</span>}
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div>
          <p className="text-xs text-zinc-400">{fecha}</p>
          <p className="mt-1 text-lg font-medium leading-snug text-zinc-900">{p.texto}</p>
        </div>

        {esperandoBorrador ? (
          <div className="flex items-center gap-2 rounded-2xl bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
            Redactando la respuesta…
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              {confianza && <span className={`rounded-full px-2.5 py-0.5 font-medium ${confianza.clase}`}>{confianza.texto}</span>}
              {p.categoria && <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-zinc-600">{CATEGORIA[p.categoria] ?? p.categoria}</span>}
              {p.nota_ia && <span className="text-amber-700">{p.nota_ia}</span>}
            </div>
            {p.borrador_error && !p.borrador && <p className="text-sm text-red-600">No se pudo redactar: {p.borrador_error}</p>}
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={Math.min(8, Math.max(3, Math.ceil(texto.length / 70)))}
              placeholder="Escribe tu respuesta…"
              className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none focus:border-zinc-400 focus:bg-white"
            />
            <div className="flex justify-between text-[11px] text-zinc-400">
              <span className={problema ? "text-red-600" : ""}>{problema ?? (texto !== (p.borrador ?? "") && p.borrador ? "La corregiste: la IA aprende de tus cambios." : "")}</span>
              <span>{texto.length} / 2,000</span>
            </div>
          </div>
        )}

        {indicando && (
          <div className="flex flex-col gap-2 rounded-2xl bg-violet-50 p-3 sm:flex-row sm:items-center">
            <input
              value={indicacion}
              onChange={(e) => setIndicacion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void redactar();
                }
              }}
              placeholder='¿Qué le digo? Ej. "sí hay en negro, el gris llega en 2 semanas"'
              className="flex-1 rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400"
              autoFocus
            />
            <button type="button" onClick={redactar} disabled={redactando} className="rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60">
              {redactando ? "Redactando…" : "Redactar de nuevo"}
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
          className="space-y-3"
        >
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <BotonGuardar
              cargando={enviando}
              disabled={!texto.trim() || Boolean(problema) || esperandoBorrador}
              textoCargando="Enviando…"
              textoListo="Enviada"
              className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Enviar respuesta
            </BotonGuardar>
            {iaLista && !indicando && (
              <button type="button" onClick={() => setIndicando(true)} disabled={redactando} className="text-sm font-medium text-violet-700 hover:text-violet-900">
                {p.borrador ? "Redactar otra vez…" : "Redactar…"}
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                const r = await descartar(p.id);
                if (r.error) setError(r.error);
              }}
              className="ml-auto text-xs text-zinc-400 hover:text-zinc-700"
            >
              quitar sin contestar
            </button>
          </div>
        </form>
      </div>
    </article>
  );
}

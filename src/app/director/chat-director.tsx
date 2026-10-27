"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MensajeChatDirector } from "@/lib/tipos";
import { enviarMensajeDirector } from "./actions";

const SUGERENCIAS = ["¿Qué toca hoy?", "Revisa la cuenta de Meli", "Propón relámpago para pasado mañana", "¿Qué se acaba en Full?", "Estado de las propuestas"];

function horaDe(iso: string) {
  return new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short" });
}

/** Texto con **negritas** y saltos de línea, sin librerías: lo que usa el
 * Director en sus respuestas (listas numeradas, negritas). */
function Texto({ texto }: { texto: string }) {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span className="whitespace-pre-wrap break-words">
      {partes.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>))}
    </span>
  );
}

type Burbuja = Pick<MensajeChatDirector, "id" | "creado_en" | "rol" | "texto" | "acciones" | "costo_usd" | "error">;

/** El chat con el Director (Isaac: "un chat ahí que le pueda escribir cosas").
 * Tú escribes abajo; el Director lee el CRM, contesta aquí y deja sus
 * propuestas en la lista de abajo. La conversación se guarda. */
export function ChatDirector({ mensajes, disponible, motivoNoDisponible }: { mensajes: MensajeChatDirector[]; disponible: boolean; motivoNoDisponible: string | null }) {
  const router = useRouter();
  const [lista, setLista] = useState<Burbuja[]>(mensajes);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fondo = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  // Cuando la página se refresca (router.refresh) llegan los mensajes ya
  // guardados: se toman tal cual (patrón "derivar estado de props").
  const [base, setBase] = useState(mensajes);
  if (base !== mensajes) {
    setBase(mensajes);
    setLista(mensajes);
  }

  useEffect(() => {
    fondo.current?.scrollTo({ top: fondo.current.scrollHeight, behavior: "smooth" });
  }, [lista, enviando]);

  async function enviar(contenido?: string) {
    const t = (contenido ?? texto).trim();
    if (!t || enviando) return;
    setError(null);
    setTexto("");
    setEnviando(true);
    const ahora = new Date().toISOString();
    setLista((l) => [...l, { id: `tmp-${ahora}`, creado_en: ahora, rol: "ISAAC", texto: t, acciones: [], costo_usd: null, error: null }]);
    try {
      const r = await enviarMensajeDirector(t);
      if ("error" in r && r.error) {
        setError(r.error);
        setLista((l) => [...l, { id: `err-${Date.now()}`, creado_en: new Date().toISOString(), rol: "SISTEMA", texto: r.error!, acciones: [], costo_usd: null, error: r.error! }]);
      } else if ("respuesta" in r && typeof r.respuesta === "string") {
        const ok = r as { respuesta: string; acciones: string[]; costoUsd: number; mensajeId: string | null };
        setLista((l) => [...l, { id: ok.mensajeId ?? `dir-${Date.now()}`, creado_en: new Date().toISOString(), rol: "DIRECTOR", texto: ok.respuesta, acciones: ok.acciones ?? [], costo_usd: ok.costoUsd ?? null, error: null }]);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo mandar el mensaje.");
    } finally {
      setEnviando(false);
      campo.current?.focus();
    }
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Habla con el Director</h2>
          <p className="text-xs text-zinc-500">Pídele lo que quieras de tu cuenta de Mercado Libre. Lo que proponga aparece abajo para que lo apruebes.</p>
        </div>
        <span className={`h-2.5 w-2.5 rounded-full ${disponible ? "bg-emerald-500" : "bg-zinc-300"}`} title={disponible ? "Listo" : motivoNoDisponible ?? "No disponible"} />
      </div>

      <div ref={fondo} className="max-h-[28rem] min-h-[14rem] space-y-3 overflow-y-auto bg-zinc-50/60 px-4 py-4">
        {lista.length === 0 && (
          <div className="py-8 text-center text-sm text-zinc-400">
            Todavía no hay conversación. Empieza con “¿Qué toca hoy?” o pídele algo concreto.
          </div>
        )}
        {lista.map((m) => {
          if (m.rol === "SISTEMA") {
            return (
              <div key={m.id} className="flex justify-center">
                <span className={`max-w-[90%] rounded-full px-3 py-1 text-center text-[11px] ${m.error ? "bg-red-50 text-red-700" : "bg-zinc-200/70 text-zinc-600"}`}>{m.texto}</span>
              </div>
            );
          }
          const mio = m.rol === "ISAAC";
          return (
            <div key={m.id} className={`flex ${mio ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${mio ? "rounded-br-md bg-[#2D3277] text-white" : "rounded-bl-md border border-zinc-200 bg-white text-zinc-900"}`}>
                <Texto texto={m.texto} />
                <div className={`mt-1.5 flex flex-wrap items-center gap-x-2 text-[10px] ${mio ? "text-white/60" : "text-zinc-400"}`}>
                  <span>{horaDe(m.creado_en)}</span>
                  {!mio && m.acciones?.length > 0 && <span title={m.acciones.join(" · ")}>· {m.acciones.join(" · ")}</span>}
                  {!mio && m.costo_usd !== null && m.costo_usd !== undefined && m.costo_usd > 0 && <span>· ${Number(m.costo_usd).toFixed(2)} USD</span>}
                </div>
              </div>
            </div>
          );
        })}
        {enviando && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-500 shadow-sm">
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-[#2D3277]" />
                El Director está revisando el CRM… (puede tardar hasta un minuto)
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-zinc-100 px-4 py-3">
        {!disponible && motivoNoDisponible && <p className="mb-2 text-xs text-amber-700">{motivoNoDisponible}</p>}
        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {SUGERENCIAS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={!disponible || enviando}
              onClick={() => enviar(s)}
              className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700 transition hover:bg-zinc-200 disabled:opacity-40"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            ref={campo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar();
              }
            }}
            rows={2}
            disabled={!disponible || enviando}
            placeholder={disponible ? "Escríbele al Director… (Enter para mandar, Shift+Enter para otra línea)" : "El Director no está disponible"}
            className="min-h-[2.75rem] flex-1 resize-y rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#2D3277] focus:bg-white disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!disponible || enviando || !texto.trim()}
            className="rounded-2xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 active:scale-[0.97] disabled:opacity-40"
          >
            Mandar
          </button>
        </form>
      </div>
    </section>
  );
}

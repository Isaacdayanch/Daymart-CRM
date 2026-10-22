"use client";

import { useState } from "react";
import { BotonGuardar } from "@/components/boton-guardar";
import { conectarWhatsappAccion, desconectarWhatsappAccion } from "./actions";

/** Avisos al celular por WhatsApp (CallMeBot): cada pregunta nueva llega con
 * su respuesta lista y el link para aprobarla. */
export function PanelWhatsapp({ telefono }: { telefono: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [cambiando, setCambiando] = useState(false);
  const conectado = Boolean(telefono) && !cambiando;

  return (
    <details className="rounded-3xl border border-zinc-200 bg-white p-5">
      <summary className="cursor-pointer text-sm font-semibold text-zinc-900">
        Avisos al celular (WhatsApp){" "}
        <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${telefono ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>{telefono ? "activos" : "apagados"}</span>
      </summary>
      <div className="mt-3 space-y-3 text-sm text-zinc-600">
        {conectado ? (
          <div className="flex flex-wrap items-center gap-3">
            <p>
              Cada pregunta nueva te llega a WhatsApp (<span className="font-mono">{telefono}</span>) con su respuesta lista y el link para aprobarla.
            </p>
            <button type="button" onClick={() => setCambiando(true)} className="text-xs font-medium text-zinc-500 hover:text-zinc-900">
              cambiar
            </button>
            <button
              type="button"
              onClick={async () => {
                await desconectarWhatsappAccion();
                setMensaje(null);
              }}
              className="text-xs font-medium text-red-600 hover:text-red-700"
            >
              apagar avisos
            </button>
          </div>
        ) : (
          <form
            action={async (fd) => {
              setError(null);
              const r = await conectarWhatsappAccion(fd);
              if (r.error) setError(r.error);
              else {
                setMensaje(`Listo: te mandé un mensaje de prueba a ${r.telefono}.`);
                setCambiando(false);
              }
            }}
            className="space-y-3"
          >
            <ol className="list-decimal space-y-1 pl-5 text-xs text-zinc-500">
              <li>
                Abre{" "}
                <a href="https://www.callmebot.com/blog/free-api-whatsapp-messages/" target="_blank" rel="noreferrer" className="font-medium text-zinc-900 underline">
                  CallMeBot
                </a>{" "}
                y guarda en tus contactos el número de WhatsApp que aparece ahí.
              </li>
              <li>
                Mándale por WhatsApp este mensaje: <span className="font-mono text-zinc-900">I allow callmebot to send me messages</span>
              </li>
              <li>Te contesta con tu &quot;apikey&quot; (unos números). Pégala aquí abajo con tu celular.</li>
            </ol>
            <div className="grid gap-2 sm:grid-cols-2">
              <input name="telefono" placeholder="Tu celular (10 dígitos)" defaultValue={telefono ?? ""} inputMode="tel" className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:bg-white" />
              <input name="apikey" placeholder="apikey de CallMeBot" className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:bg-white" />
            </div>
            {error && <p className="text-red-600">{error}</p>}
            <BotonGuardar textoCargando="Mandando prueba…" className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800">
              Conectar mi WhatsApp
            </BotonGuardar>
          </form>
        )}
        {mensaje && <p className="text-emerald-700">{mensaje}</p>}
      </div>
    </details>
  );
}

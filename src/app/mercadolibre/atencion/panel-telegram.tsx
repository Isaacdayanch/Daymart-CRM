"use client";

import { useState } from "react";
import { conectarTelegramAccion, desconectarTelegramAccion } from "./actions";

/** Avisos al celular por Telegram: cada pregunta nueva llega con su borrador. */
export function PanelTelegram({ configurado, conectado }: { configurado: boolean; conectado: boolean }) {
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function conectar() {
    setTrabajando(true);
    setError(null);
    const r = await conectarTelegramAccion();
    setTrabajando(false);
    if (r.error) setError(r.error);
    else setMensaje(`Conectado con ${r.nombre}: te mandé un mensaje de prueba.`);
  }

  return (
    <details className="rounded-3xl border border-zinc-200 bg-white p-5">
      <summary className="cursor-pointer text-sm font-semibold text-zinc-900">
        Avisos al celular (Telegram){" "}
        <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${conectado ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
          {conectado ? "activos" : "apagados"}
        </span>
      </summary>
      <div className="mt-3 space-y-3 text-sm text-zinc-600">
        {!configurado ? (
          <p>
            Para activarlos falta la llave del bot de Telegram (<span className="font-mono">TELEGRAM_BOT_TOKEN</span>) en Vercel. Cuando la pongas, aquí aparece el botón para conectar tu celular.
          </p>
        ) : conectado ? (
          <div className="flex flex-wrap items-center gap-3">
            <p>Cada pregunta nueva te llega a Telegram con su borrador y el link para aprobarla.</p>
            <button type="button" onClick={conectar} disabled={trabajando} className="text-xs font-medium text-zinc-500 hover:text-zinc-900">
              cambiar de chat
            </button>
            <button
              type="button"
              onClick={async () => {
                await desconectarTelegramAccion();
                setMensaje(null);
              }}
              className="text-xs font-medium text-red-600 hover:text-red-700"
            >
              apagar avisos
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p>1. Abre tu bot en Telegram y mándale &quot;hola&quot;. 2. Pícale aquí:</p>
            <button type="button" onClick={conectar} disabled={trabajando} className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60">
              {trabajando ? "Conectando…" : "Conectar mi Telegram"}
            </button>
          </div>
        )}
        {mensaje && <p className="text-emerald-700">{mensaje}</p>}
        {error && <p className="text-red-600">{error}</p>}
      </div>
    </details>
  );
}

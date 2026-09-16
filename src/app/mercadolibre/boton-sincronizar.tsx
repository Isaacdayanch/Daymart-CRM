"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sincronizarVentasPagina } from "./actions";

export function BotonSincronizar({ conectado, primeraVez }: { conectado: boolean; primeraVez: boolean }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [avance, setAvance] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  /** Va página por página (50 órdenes cada una) hasta terminar. */
  async function correr(diasAtras?: number) {
    setCargando(true);
    setMensaje(null);
    setAvance("Conectando con Mercado Libre…");
    let offset: number | undefined = 0;
    let desdeIso: string | undefined;
    let guardadas = 0;
    while (offset !== undefined) {
      const r = await sincronizarVentasPagina({ diasAtras, offset, desdeIso });
      if (r.error) {
        setMensaje(`Error: ${r.error}`);
        setCargando(false);
        setAvance(null);
        router.refresh();
        return;
      }
      guardadas += r.guardadas;
      desdeIso = r.desdeIso;
      setAvance(`${guardadas}${r.total ? ` de ${r.total}` : ""} órdenes…`);
      offset = r.siguiente === null ? undefined : r.siguiente;
    }
    setCargando(false);
    setAvance(null);
    setMensaje(`Listo: ${guardadas} órdenes actualizadas.`);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!conectado || cargando}
          onClick={() => correr()}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {cargando ? "Sincronizando…" : primeraVez ? "Traer mis ventas (últimos 60 días)" : "Sincronizar"}
        </button>
        <button
          type="button"
          disabled={!conectado || cargando}
          onClick={() => {
            if (!window.confirm("Se vuelven a traer todas las ventas del último año desde Mercado Libre. Puede tardar unos minutos. ¿Continuar?")) return;
            correr(365);
          }}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          Traer último año
        </button>
      </div>
      {avance && (
        <p className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
          {avance}
        </p>
      )}
      {mensaje && <p className={`text-xs ${mensaje.startsWith("Error") ? "text-red-600" : "text-emerald-700"}`}>{mensaje}</p>}
    </div>
  );
}

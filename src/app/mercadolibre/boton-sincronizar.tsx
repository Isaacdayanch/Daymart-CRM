"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sincronizarVentas } from "./actions";

export function BotonSincronizar({ conectado, primeraVez }: { conectado: boolean; primeraVez: boolean }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function correr(diasAtras?: number) {
    setCargando(true);
    setMensaje(null);
    const r = await sincronizarVentas(diasAtras);
    setCargando(false);
    setMensaje(r.error ? `Error: ${r.error}` : `Listo: ${r.guardadas} órdenes actualizadas.`);
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
          {cargando ? "Sincronizando..." : primeraVez ? "Traer mis ventas (últimos 60 días)" : "Sincronizar"}
        </button>
        {!primeraVez && (
          <button
            type="button"
            disabled={!conectado || cargando}
            onClick={() => correr(365)}
            className="text-xs text-zinc-500 hover:text-zinc-900 disabled:opacity-50"
            title="Vuelve a traer todo el último año (tarda más)"
          >
            traer último año
          </button>
        )}
      </div>
      {mensaje && <p className={`text-xs ${mensaje.startsWith("Error") ? "text-red-600" : "text-emerald-700"}`}>{mensaje}</p>}
    </div>
  );
}

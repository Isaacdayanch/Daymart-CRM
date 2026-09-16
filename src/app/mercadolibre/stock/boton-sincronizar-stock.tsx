"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sincronizarStock } from "../actions";

export function BotonSincronizarStock({ conectado }: { conectado: boolean }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={!conectado || cargando}
        onClick={async () => {
          setCargando(true);
          setMensaje(null);
          const r = await sincronizarStock();
          setCargando(false);
          setMensaje(r.error ? `Error: ${r.error}` : `Listo: ${r.renglones} publicaciones/variantes.`);
          router.refresh();
        }}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {cargando ? "Actualizando..." : "Actualizar desde Mercado Libre"}
      </button>
      {mensaje && <p className={`text-xs ${mensaje.startsWith("Error") ? "text-red-600" : "text-emerald-700"}`}>{mensaje}</p>}
    </div>
  );
}

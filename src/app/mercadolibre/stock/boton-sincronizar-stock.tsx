"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { iniciarSyncStock, sincronizarLoteStock, terminarSyncStock } from "../actions";

const TAMANO_LOTE = 40;

export function BotonSincronizarStock({ conectado }: { conectado: boolean }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [avance, setAvance] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  /** 1) lista de publicaciones, 2) tandas de 40 con su stock en Full, 3) cierre. */
  async function correr() {
    setCargando(true);
    setMensaje(null);
    setAvance("Listando tus publicaciones…");
    const inicio = await iniciarSyncStock();
    if (inicio.error) {
      setMensaje(`Error: ${inicio.error}`);
      setCargando(false);
      setAvance(null);
      return;
    }
    const ids = inicio.ids;
    let renglones = 0;
    for (let i = 0; i < ids.length; i += TAMANO_LOTE) {
      setAvance(`Publicaciones ${Math.min(i + TAMANO_LOTE, ids.length)} de ${ids.length}…`);
      const r = await sincronizarLoteStock(ids.slice(i, i + TAMANO_LOTE), i === 0);
      if (r.error) {
        setMensaje(`Error: ${r.error}`);
        setCargando(false);
        setAvance(null);
        router.refresh();
        return;
      }
      renglones += r.renglones;
    }
    if (ids.length === 0) await sincronizarLoteStock([], true);
    await terminarSyncStock();
    setCargando(false);
    setAvance(null);
    setMensaje(`Listo: ${ids.length} publicaciones, ${renglones} renglones (con variantes).`);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={!conectado || cargando}
        onClick={correr}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {cargando ? "Actualizando…" : "Actualizar desde Mercado Libre"}
      </button>
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

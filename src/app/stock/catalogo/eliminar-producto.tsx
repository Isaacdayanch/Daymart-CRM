"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eliminarProductoStock } from "./actions";

/** "Quitar este producto" (solo dueño). A propósito no es un solo clic:
 * se abre un bloque de confirmación donde hay que escribir el SKU exacto.
 * Pensado para productos duplicados o dados de alta por error. */
export function EliminarProducto({ sku, nombre, compacto = false }: { sku: string; nombre: string; compacto?: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const coincide = confirmacion.trim().toUpperCase() === sku.trim().toUpperCase();

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={compacto ? "text-[11px] text-zinc-400 hover:text-red-600 hover:underline" : "text-xs text-zinc-400 hover:text-red-600 hover:underline"}
      >
        quitar producto
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        setEnviando(true);
        setError(null);
        const r = await eliminarProductoStock(sku, fd);
        setEnviando(false);
        if (r.error) setError(r.error);
        else {
          router.push("/stock/catalogo");
          router.refresh();
        }
      }}
      className="w-full rounded-xl border border-red-200 bg-red-50/60 p-4 text-left"
    >
      <p className="text-sm font-semibold text-red-800">¿Quitar «{nombre}» de Stock?</p>
      <p className="mt-1 text-xs text-red-700">
        Se borran sus movimientos capturados a mano, sus ligas con Mercado Libre y sus precios de vendedores. No se puede deshacer. Si el producto está en un contenedor, tiene ventas o salidas de Mercado Libre, el sistema no lo va a dejar (se corrige desde ahí).
      </p>
      <label className="mt-3 block text-xs font-medium text-red-800">
        Para confirmar escribe el SKU: <span className="font-mono">{sku}</span>
      </label>
      <input
        name="confirmacion"
        value={confirmacion}
        onChange={(e) => setConfirmacion(e.target.value)}
        autoComplete="off"
        placeholder={sku}
        className="mt-1 block w-full rounded-lg border border-red-300 bg-white px-3 py-2 font-mono text-sm focus:border-red-500 focus:ring-red-500 sm:w-72"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!coincide || enviando}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {enviando ? "Quitando…" : "Quitar definitivamente"}
        </button>
        <button type="button" onClick={() => { setAbierto(false); setConfirmacion(""); setError(null); }} className="text-xs text-zinc-500 hover:text-zinc-900">
          Cancelar
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </form>
  );
}

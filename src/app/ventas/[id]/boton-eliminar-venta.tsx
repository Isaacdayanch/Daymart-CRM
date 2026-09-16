"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eliminarVenta } from "../actions";

/** Borrar una venta regresa la mercancía al stock y quita sus cobros de
 * Finanzas. Se pide escribir el número de la venta para confirmar (mismo
 * cuidado que con los contenedores). */
export function BotonEliminarVenta({ ventaId, numero }: { ventaId: string; numero: number }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="text-sm text-zinc-400 hover:text-red-600">
        Cancelar venta
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-red-200 bg-red-50 p-4 sm:w-80">
      <p className="text-xs text-red-800">
        Esto regresa los productos al stock y borra sus cobros de Finanzas. Escribe <span className="font-mono font-semibold">{numero}</span>{" "}
        para confirmar.
      </p>
      <input
        type="text"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        className="mt-2 block w-full rounded-lg border border-red-300 px-3 py-1.5 text-sm focus:border-red-500 focus:ring-red-500"
      />
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={texto !== String(numero) || borrando}
          onClick={async () => {
            setBorrando(true);
            const r = await eliminarVenta(ventaId);
            if (r.error) {
              setError(r.error);
              setBorrando(false);
              return;
            }
            router.push("/ventas");
          }}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-40"
        >
          {borrando ? "Cancelando..." : "Sí, cancelar venta"}
        </button>
        <button type="button" onClick={() => setAbierto(false)} className="text-xs text-zinc-500 hover:text-zinc-900">
          No, dejarla
        </button>
      </div>
    </div>
  );
}

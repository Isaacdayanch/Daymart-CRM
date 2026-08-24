"use client";

import type { PendienteChina } from "@/lib/tipos";
import { cancelarPendiente, marcarPagadoPendiente } from "../actions";

export function FilaPendiente({ pendiente }: { pendiente: PendienteChina }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
      <div className="flex items-center gap-3">
        {pendiente.imagen_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- miniatura en lista de pendientes
          <img src={pendiente.imagen_url} alt={pendiente.nombre} className="h-12 w-12 rounded-lg object-cover" />
        ) : (
          <div className="h-12 w-12 rounded-lg bg-zinc-100" />
        )}
        <div>
          <p className="text-sm font-medium text-zinc-900">{pendiente.nombre}</p>
          <p className="font-mono text-xs text-zinc-400">{pendiente.sku}</p>
          {(pendiente.fabrica || pendiente.proveedor) && (
            <p className="text-xs text-zinc-500">
              {[pendiente.fabrica, pendiente.proveedor].filter(Boolean).join(" · ")}
            </p>
          )}
          {pendiente.notas && <p className="mt-0.5 text-xs text-zinc-400 italic">{pendiente.notas}</p>}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-semibold text-zinc-900">{pendiente.cantidad_pendiente} pzas</p>
        </div>
        <button
          type="button"
          onClick={() => marcarPagadoPendiente(pendiente.id, !pendiente.pagado)}
          className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition ${
            pendiente.pagado
              ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
              : "bg-zinc-100 text-zinc-600 ring-zinc-500/20 hover:bg-zinc-200"
          }`}
        >
          {pendiente.pagado ? "Pagado" : "Sin pagar"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm(`¿Cancelar el pendiente de ${pendiente.nombre}?`)) cancelarPendiente(pendiente.id);
          }}
          className="text-xs font-medium text-zinc-400 hover:text-red-600"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

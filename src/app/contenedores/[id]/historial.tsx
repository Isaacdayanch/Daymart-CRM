import { ESTADOS_CONTENEDOR, type EstadoContenedor, type HistorialEstado } from "@/lib/tipos";
import { formatoFecha } from "@/lib/formato";

export function Historial({ historial }: { historial: HistorialEstado[] }) {
  const primeraFechaPorEstado = new Map<EstadoContenedor, string>();
  for (const h of historial) {
    const existente = primeraFechaPorEstado.get(h.estado);
    if (!existente || new Date(h.fecha) < new Date(existente)) {
      primeraFechaPorEstado.set(h.estado, h.fecha);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6">
      <p className="text-sm font-medium text-zinc-700">Historial de fechas</p>
      <ol className="mt-3 space-y-2">
        {ESTADOS_CONTENEDOR.map((e) => {
          const fecha = primeraFechaPorEstado.get(e.valor);
          return (
            <li key={e.valor} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${fecha ? "bg-emerald-500" : "bg-zinc-200"}`}
                />
                <span className={fecha ? "text-zinc-900" : "text-zinc-400"}>{e.etiqueta}</span>
              </div>
              <span className="text-xs text-zinc-500">{fecha ? formatoFecha(fecha) : "Pendiente"}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

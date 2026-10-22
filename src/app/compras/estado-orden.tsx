import { ESTADOS_ORDEN_COMPRA, type EstadoOrdenCompra } from "@/lib/tipos";

/** Pastilla de estado de una orden de compra. */
export function EstadoOrden({ estado, vencida = false }: { estado: EstadoOrdenCompra; vencida?: boolean }) {
  const estilo =
    estado === "RECIBIDA"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
      : estado === "CANCELADA"
        ? "bg-zinc-100 text-zinc-500 ring-zinc-400/30"
        : vencida
          ? "bg-red-50 text-red-700 ring-red-600/20"
          : estado === "PARCIAL"
            ? "bg-sky-50 text-sky-700 ring-sky-600/20"
            : "bg-amber-50 text-amber-700 ring-amber-600/20";
  const etiqueta = vencida && (estado === "PEDIDA" || estado === "PARCIAL") ? "Atrasada" : (ESTADOS_ORDEN_COMPRA.find((e) => e.valor === estado)?.etiqueta ?? estado);
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${estilo}`}>{etiqueta}</span>;
}

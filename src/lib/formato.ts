import type { EstadoContenedor } from "./tipos";

export function formatoPesos(valor: number) {
  return valor.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
}

export function formatoFecha(fechaIso: string) {
  return new Date(fechaIso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export const ESTILO_ESTADO: Record<EstadoContenedor, string> = {
  CONFIGURANDOSE: "bg-zinc-100 text-zinc-700 ring-zinc-500/20",
  EN_TRANSITO: "bg-sky-50 text-sky-700 ring-sky-600/20",
  RECIBIDO_PUERTO: "bg-amber-50 text-amber-700 ring-amber-600/20",
  LIBERADO_ADUANA: "bg-violet-50 text-violet-700 ring-violet-600/20",
  RECIBIDO_BODEGA: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

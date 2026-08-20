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
  EN_TRANSITO: "bg-sky-50 text-sky-700 ring-sky-600/20",
  DEPOSIT_PAID: "bg-amber-50 text-amber-700 ring-amber-600/20",
  DEPOSIT_PAID_10K_RECEIVED: "bg-amber-50 text-amber-700 ring-amber-600/20",
  FULLY_PAID: "bg-violet-50 text-violet-700 ring-violet-600/20",
  RECEIVED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

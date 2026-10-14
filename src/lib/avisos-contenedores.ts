// Avisos de llegada de contenedores (puro, sin base de datos).

import type { Contenedor, EstadoContenedor } from "./tipos";

/** Estados en los que el contenedor todavía no está en la bodega. */
export const ESTADOS_EN_CAMINO: EstadoContenedor[] = ["EN_TRANSITO", "RECIBIDO_PUERTO", "LIBERADO_ADUANA"];

/** Días desde hoy (texto YYYY-MM-DD, calendario CDMX) hasta la fecha dada; negativo = ya pasó. */
export function diasHasta(fecha: string, hoyTexto: string) {
  const [a, m, d] = fecha.slice(0, 10).split("-").map(Number);
  const [ha, hm, hd] = hoyTexto.split("-").map(Number);
  return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(ha, hm - 1, hd)) / 86400000);
}

export interface LlegadaProxima {
  contenedor: Pick<Contenedor, "id" | "numero" | "estado" | "fecha_estimada_llegada">;
  dias: number;
  /** vencida = la fecha ya pasó y el contenedor sigue sin llegar a bodega. */
  vencida: boolean;
}

/** Contenedores en camino cuya llegada estimada está a `diasAviso` días o
 * menos (o ya pasó), los más urgentes primero. */
export function llegadasProximas<T extends Pick<Contenedor, "id" | "numero" | "estado" | "fecha_estimada_llegada" | "eliminado_en">>(
  contenedores: T[],
  hoyTexto: string,
  diasAviso = 7,
): LlegadaProxima[] {
  return contenedores
    .filter((c) => !c.eliminado_en && c.fecha_estimada_llegada && ESTADOS_EN_CAMINO.includes(c.estado))
    .map((c) => {
      const dias = diasHasta(c.fecha_estimada_llegada as string, hoyTexto);
      return { contenedor: c, dias, vencida: dias < 0 };
    })
    .filter((l) => l.dias <= diasAviso)
    .sort((a, b) => a.dias - b.dias);
}

export function textoLlegada(l: LlegadaProxima) {
  if (l.dias < 0) return `debía llegar hace ${-l.dias} día${l.dias === -1 ? "" : "s"}`;
  if (l.dias === 0) return "llega hoy";
  if (l.dias === 1) return "llega mañana";
  return `llega en ${l.dias} días`;
}

/** "20 oct 2026" a partir de una fecha YYYY-MM-DD, sin que el huso la mueva de día. */
export function formatoFechaCorta(fecha: string) {
  const [a, m, d] = fecha.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12)).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

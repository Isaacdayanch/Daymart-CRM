// Todas las fechas/horas que vienen de Mercado Libre se muestran en el
// horario de la Ciudad de México, sin importar en qué zona esté el servidor
// (Vercel corre en UTC) ni el celular de Isaac. Así lo pidió él para no
// tener errores de horario contra lo que ve en Mercado Libre.

export const ZONA_MX = "America/Mexico_City";

export function formatoFechaHoraMx(fechaIso: string) {
  return new Date(fechaIso).toLocaleString("es-MX", {
    timeZone: ZONA_MX,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatoFechaMx(fechaIso: string) {
  return new Date(fechaIso).toLocaleDateString("es-MX", {
    timeZone: ZONA_MX,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Diferencia (en ms) entre la hora de Ciudad de México y UTC en un
 * instante dado. Se calcula con Intl (no a mano) para que siga correcto si
 * algún día México vuelve a cambiar de horario. */
function desfaseMxMs(instante: Date) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_MX,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instante);
  const v = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  const comoUtc = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour") % 24, v("minute"), v("second"));
  return comoUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

/** Las 00:00 del día (de Ciudad de México) en que cae el instante dado. */
export function inicioDelDiaMx(instante: Date) {
  const desfase = desfaseMxMs(instante);
  const local = new Date(instante.getTime() + desfase);
  const inicioLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(inicioLocal - desfase);
}

/** El día 1 a las 00:00 (de Ciudad de México) del mes del instante dado. */
export function inicioDelMesMx(instante: Date) {
  const desfase = desfaseMxMs(instante);
  const local = new Date(instante.getTime() + desfase);
  const inicioLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1);
  return new Date(inicioLocal - desfase);
}

export function formatoHoraMx(fechaIso: string) {
  return new Date(fechaIso).toLocaleTimeString("es-MX", { timeZone: ZONA_MX, hour: "2-digit", minute: "2-digit" });
}

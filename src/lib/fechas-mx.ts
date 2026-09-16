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

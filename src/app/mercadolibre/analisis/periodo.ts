import { inicioDelDiaMx, instanteDesdeFechaMx } from "@/lib/fechas-mx";

const DIA_MS = 86400000;
const esFecha = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

/** Periodo del análisis: `?dias=7|30|90` (hasta hoy) o `?desde&hasta`. */
export function periodoAnalisis(params: { dias?: string; desde?: string; hasta?: string }) {
  const ahora = new Date();
  const finHoy = new Date(inicioDelDiaMx(ahora).getTime() + DIA_MS);
  if (esFecha(params.desde) && esFecha(params.hasta)) {
    return { desde: instanteDesdeFechaMx(params.desde!), hasta: new Date(instanteDesdeFechaMx(params.hasta!).getTime() + DIA_MS), dias: "" };
  }
  const dias = [7, 30, 90].includes(Number(params.dias)) ? Number(params.dias) : 30;
  return { desde: new Date(inicioDelDiaMx(ahora).getTime() - (dias - 1) * DIA_MS), hasta: finHoy, dias: String(dias) };
}


// Cuánto vale, en pesos, la mercancía de un contenedor que se quedó
// pendiente en China pero YA se pagó — es dinero que salió (por eso el
// costo total del contenedor lo cuenta) pero nunca entró a stock (por eso
// no aparece en "valor que entró a stock"). Esa diferencia es real, no un
// error, y esto calcula cuánto es con la misma fórmula de costo por pieza
// que usa cualquier producto de contenedor (flete/aduana repartido por CBM
// + precio en dólares al tipo de cambio promedio de mercancía).

import type { PendienteChina } from "./tipos";

function costoFinalPorPiezaPendiente(
  p: Pick<PendienteChina, "largo_cm" | "ancho_cm" | "alto_cm" | "piezas_por_caja" | "precio_dolares">,
  costoPorCbm: number,
  tipoCambioMercancia: number,
) {
  if (!p.piezas_por_caja) return p.precio_dolares * tipoCambioMercancia;
  const cajaCbm = (p.largo_cm * p.ancho_cm * p.alto_cm) / 1_000_000;
  const gastoRepartido = (cajaCbm * costoPorCbm) / p.piezas_por_caja;
  return gastoRepartido + p.precio_dolares * tipoCambioMercancia;
}

export function valorPendienteChinaPagado(
  pendientes: PendienteChina[],
  costoPorCbm: number,
  tipoCambioMercancia: number,
) {
  return pendientes.reduce(
    (suma, p) => suma + costoFinalPorPiezaPendiente(p, costoPorCbm, tipoCambioMercancia) * p.cantidad_pendiente,
    0,
  );
}

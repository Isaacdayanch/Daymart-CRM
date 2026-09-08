import type { MovimientoFinanciero, RegistroGanancia } from "./tipos";

export function totalGanancias(registros: RegistroGanancia[]) {
  return registros.reduce((suma, r) => suma + r.monto, 0);
}

/** Lo que Isaac ha dado de Maaser: suma de las salidas de Finanzas ya
 * categorizadas como "Maaser" (mismo formulario de "Mandar dinero" de
 * siempre, sin pantalla ni captura aparte). Solo en pesos — Maaser se paga
 * en pesos en la práctica de Isaac. */
export function totalPagadoMaaser(movimientos: MovimientoFinanciero[], categoriaMaaserId: string | null) {
  if (!categoriaMaaserId) return 0;
  return movimientos
    .filter((m) => m.tipo === "SALIDA" && m.categoria_id === categoriaMaaserId && m.moneda === "MXN")
    .reduce((suma, m) => suma + m.monto, 0);
}

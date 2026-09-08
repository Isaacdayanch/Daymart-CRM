// Cálculos del módulo de Finanzas. Igual que en Stock: el saldo de cada
// cuenta nunca se guarda a mano, siempre se deriva del libro de movimientos.

import type { CuentaFinanciera, Moneda, MovimientoFinanciero } from "./tipos";

/** Cuánto suma o resta un movimiento al saldo de UNA cuenta en particular
 * (una transferencia afecta distinto a la cuenta de origen que a la de
 * destino, así que hay que pasarle la cuenta que se está evaluando). */
function delta(m: MovimientoFinanciero, cuentaId: string) {
  if (m.tipo === "ENTRADA") return m.cuenta_id === cuentaId ? m.monto : 0;
  if (m.tipo === "SALIDA") return m.cuenta_id === cuentaId ? -m.monto : 0;
  // TRANSFERENCIA: resta de la cuenta de origen, suma a la de destino — y no
  // cuenta como ingreso ni gasto en ningún reporte.
  if (m.cuenta_id === cuentaId) return -m.monto;
  if (m.cuenta_destino_id === cuentaId) return m.monto;
  return 0;
}

export function saldoCuenta(movimientos: MovimientoFinanciero[], cuentaId: string, moneda: Moneda = "MXN") {
  return movimientos
    .filter((m) => m.moneda === moneda)
    .reduce((suma, m) => suma + delta(m, cuentaId), 0);
}

/** Saldo de cada cuenta, por moneda — para no mezclar pesos con dólares en
 * una sola cuenta que llegue a manejar ambos algún día. */
export function saldosPorCuenta(cuentas: CuentaFinanciera[], movimientos: MovimientoFinanciero[]) {
  return cuentas.map((cuenta) => ({
    cuenta,
    saldoMxn: saldoCuenta(movimientos, cuenta.id, "MXN"),
    saldoUsd: saldoCuenta(movimientos, cuenta.id, "USD"),
  }));
}

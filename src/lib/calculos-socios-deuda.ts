// Saldos de Socios, Prestamistas y Deuda con proveedores — mismo principio
// que el resto del sistema: nunca se guardan a mano, se calculan sumando/
// restando su propio libro de movimientos.

import type { Moneda, MovimientoDeudaProveedor, MovimientoPrestamista, MovimientoSocio } from "./tipos";

export function saldoSocio(movimientos: MovimientoSocio[], socioId: string, moneda: Moneda) {
  return movimientos
    .filter((m) => m.socio_id === socioId && m.moneda === moneda)
    .reduce((suma, m) => suma + (m.tipo === "APORTE" ? m.monto : -m.monto), 0);
}

export function saldoPrestamista(movimientos: MovimientoPrestamista[], prestamistaId: string, moneda: Moneda) {
  return movimientos
    .filter((m) => m.prestamista_id === prestamistaId && m.moneda === moneda)
    .reduce((suma, m) => suma + (m.tipo === "PRESTAMO" ? m.monto : -m.monto), 0);
}

export function saldoProveedor(movimientos: MovimientoDeudaProveedor[], proveedor: string, moneda: Moneda) {
  return movimientos
    .filter((m) => m.proveedor === proveedor && m.moneda === moneda)
    .reduce((suma, m) => suma + (m.tipo === "CARGO" ? m.monto : -m.monto), 0);
}

/** Lista de proveedores distintos que ya tienen algún movimiento de deuda,
 * para no repetir texto libre a mano — mismo espíritu que
 * catalogo-proveedores.ts. */
export function proveedoresConDeuda(movimientos: MovimientoDeudaProveedor[]) {
  return [...new Set(movimientos.map((m) => m.proveedor))].sort();
}

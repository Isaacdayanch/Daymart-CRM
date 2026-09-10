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

export interface CargoAbierto {
  cargo: MovimientoDeudaProveedor;
  pendiente: number;
}

export interface CargoPorVencer extends CargoAbierto {
  vencido: boolean;
}

/** Los abonos de un proveedor no dicen a cuál cargo van — se aplican al
 * más viejo primero (FIFO), igual que cualquier cuenta corriente. Esto
 * dice qué cargos siguen abiertos y cuánto les falta, para poder avisar
 * de vencimientos por cargo (no un solo vencimiento por proveedor). */
export function cargosAbiertosProveedor(
  movimientos: MovimientoDeudaProveedor[],
  proveedor: string,
  moneda: Moneda,
): CargoAbierto[] {
  const cargos = movimientos
    .filter((m) => m.proveedor === proveedor && m.moneda === moneda && m.tipo === "CARGO")
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  let abonoDisponible = movimientos
    .filter((m) => m.proveedor === proveedor && m.moneda === moneda && m.tipo === "ABONO")
    .reduce((suma, m) => suma + m.monto, 0);

  const abiertos: CargoAbierto[] = [];
  for (const cargo of cargos) {
    const consumido = Math.min(abonoDisponible, cargo.monto);
    abonoDisponible -= consumido;
    const pendiente = cargo.monto - consumido;
    if (pendiente > 0.01) abiertos.push({ cargo, pendiente });
  }
  return abiertos;
}

/** Cargos abiertos de TODOS los proveedores que vencen dentro de
 * "diasAviso" días (o que ya vencieron) — para el aviso arriba de
 * Finanzas. */
export function cargosPorVencer(movimientos: MovimientoDeudaProveedor[], diasAviso: number, ahora = Date.now()): CargoPorVencer[] {
  const limite = ahora + diasAviso * 24 * 60 * 60 * 1000;
  const proveedores = proveedoresConDeuda(movimientos);
  const monedas: Moneda[] = ["MXN", "USD"];
  const resultado: CargoPorVencer[] = [];
  for (const proveedor of proveedores) {
    for (const moneda of monedas) {
      for (const abierto of cargosAbiertosProveedor(movimientos, proveedor, moneda)) {
        const fechaLimiteMs = abierto.cargo.fecha_limite ? new Date(abierto.cargo.fecha_limite).getTime() : null;
        if (fechaLimiteMs !== null && fechaLimiteMs <= limite) {
          resultado.push({ ...abierto, vencido: fechaLimiteMs < ahora });
        }
      }
    }
  }
  return resultado.sort((a, b) => (a.cargo.fecha_limite! < b.cargo.fecha_limite! ? -1 : 1));
}

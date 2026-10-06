// Cálculos puros del módulo Vendedores: comisión por pieza y rentabilidad
// de Isaac. Sin base de datos, para poder probarlos y reutilizarlos en la
// lista de precios (en vivo) y en los links de los vendedores.

export interface ReglaComision {
  /** Porcentaje sobre el precio de venta (ej. 10 = 10%). */
  pct: number;
  /** Monto fijo por pieza (se suma al porcentaje). */
  fija: number;
}

/** Comisión por pieza = precio × % + fijo. Nunca negativa. */
export function comisionPorPieza(precio: number, regla: ReglaComision) {
  if (!precio || precio <= 0) return 0;
  const c = precio * ((regla.pct || 0) / 100) + (regla.fija || 0);
  return Math.max(0, Math.round(c * 100) / 100);
}

export interface Rentabilidad {
  comision: number;
  /** Lo que le queda a Isaac por pieza después de costo y comisión. */
  teQueda: number;
  /** Te queda ÷ precio, en %. */
  margenPct: number;
}

export function rentabilidadPieza(precio: number, costo: number, regla: ReglaComision): Rentabilidad {
  const comision = comisionPorPieza(precio, regla);
  const teQueda = precio - costo - comision;
  return { comision, teQueda, margenPct: precio > 0 ? (teQueda / precio) * 100 : 0 };
}

/** Precio necesario para que a Isaac le quede `margenPct` % del precio:
 * precio − costo − (precio × pct + fija) = precio × margen
 * → precio × (1 − pct − margen) = costo + fija. */
export function precioParaMargenVendedor(costo: number, regla: ReglaComision, margenPct: number) {
  const divisor = 1 - (regla.pct || 0) / 100 - margenPct / 100;
  if (divisor <= 0) return null;
  return Math.ceil((costo + (regla.fija || 0)) / divisor);
}

/** Lo que gana el vendedor por pieza cuando vende a `precioVendedor` con un
 * mínimo autorizado `minimo`: su comisión normal sobre el mínimo + TODO el
 * sobreprecio (regla de Isaac, 6 oct). */
export function gananciaVendedor(minimo: number, precioVendedor: number | null | undefined, regla: ReglaComision) {
  const base = comisionPorPieza(minimo, regla);
  const precio = precioVendedor && precioVendedor > minimo ? precioVendedor : minimo;
  const sobreprecio = Math.max(0, Math.round((precio - minimo) * 100) / 100);
  return { base, sobreprecio, total: Math.round((base + sobreprecio) * 100) / 100, precio };
}

// Margen real de una publicación de Mercado Libre: lo que le queda a Isaac
// después de la comisión de ML, el envío a su cargo y el costo del producto
// (costo promedio del CRM). Cálculo puro, sin llamadas — se usa en vivo en
// la pantalla de Precios y en el resumen del día.

export interface DatosMargen {
  precio: number;
  /** % de comisión de ML (ej. 15.5) y parte fija por pieza (ej. 30 en productos baratos). */
  comisionPct: number;
  comisionFija: number;
  /** Envío promedio a cargo del vendedor por pieza (0 si el comprador lo paga). */
  envio: number;
  /** Costo promedio del producto en el CRM. */
  costo: number;
}

export interface Margen {
  comision: number;
  envio: number;
  costo: number;
  /** Pesos que le quedan por pieza. */
  queda: number;
  /** % sobre el precio de venta. */
  pct: number;
}

export function margenPublicacion(d: DatosMargen): Margen {
  const comision = redondear(d.precio * (d.comisionPct / 100) + d.comisionFija);
  const queda = redondear(d.precio - comision - d.envio - d.costo);
  return { comision, envio: d.envio, costo: d.costo, queda, pct: d.precio > 0 ? (queda / d.precio) * 100 : 0 };
}

/** Precio necesario para que quede un margen objetivo (% del precio):
 * precio − (precio·pct + fija) − envío − costo = m·precio
 * → precio = (fija + envío + costo) ÷ (1 − pct − m). */
export function precioParaMargen(d: Omit<DatosMargen, "precio">, margenObjetivoPct: number) {
  const divisor = 1 - d.comisionPct / 100 - margenObjetivoPct / 100;
  if (divisor <= 0.01) return null;
  return redondear((d.comisionFija + d.envio + d.costo) / divisor);
}

/** Precio nuevo según el modo elegido en la pantalla. */
export function precioNuevo(
  modo: "FIJO" | "PORCENTAJE" | "MARGEN",
  valor: number,
  actual: number,
  d: Omit<DatosMargen, "precio">,
): number | null {
  if (modo === "FIJO") return valor > 0 ? redondear(valor) : null;
  if (modo === "PORCENTAJE") return actual > 0 ? redondear(actual * (1 + valor / 100)) : null;
  return precioParaMargen(d, valor);
}

export function redondear(n: number) {
  return Math.round(n * 100) / 100;
}

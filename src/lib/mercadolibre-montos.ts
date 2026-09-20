// Cómo se leen los montos de una orden de Mercado Libre para que cuadren con
// el "Detalle de cobro" que Isaac ve en la app de Mercado Libre.
//
// Mercado Libre reporta en la orden `total_amount` (valor de los productos)
// y `sale_fee` por renglón. Pero con el esquema nuevo de México (ML le
// factura al comprador y el vendedor le factura a ML el neto), la orden
// puede venir con total_amount = lo que le llega a Isaac y sale_fee = 0,
// aunque el comprador haya pagado más: la comisión y el envío van "por
// dentro". Por eso se guardan también los montos del cobro (`payments` de
// la orden): lo que pagó el comprador, el envío que pagó él y la comisión
// que reporta Mercado Pago — y se deriva lo que falte.
//
// Estas funciones son puras (sin base de datos) para poder usarlas en
// pantallas y en la sincronización por igual.

export interface MontosOrden {
  /** Valor de los productos según la orden (`total_amount`). */
  total: number;
  /** Comisión guardada: la de Mercado Pago si vino, si no la de `sale_fee`. */
  comision: number;
  /** Envío a cargo del vendedor (`/shipments/{id}/costs`), null si ML aún no lo publica. */
  costo_envio_vendedor: number | null;
  /** Lo que pagó el comprador en total (incluye el envío que él pagó, si lo hubo). */
  pagado_comprador?: number | null;
  /** Envío pagado por el comprador (parte de `pagado_comprador`). */
  envio_comprador?: number | null;
}

export const redondearCentavos = (n: number) => Math.round(n * 100) / 100;

/** Valor de la venta: lo que el comprador pagó por los productos (sin el
 * envío que él mismo haya pagado). Si el cobro no se conoce, el total de la
 * orden. Nunca menor al total de la orden (un cupón de ML lo paga ML, no
 * Isaac). */
export function totalVendidoOrden(o: MontosOrden) {
  if (o.pagado_comprador != null && o.pagado_comprador > 0) {
    return Math.max(o.total, redondearCentavos(o.pagado_comprador - (o.envio_comprador ?? 0)));
  }
  return o.total;
}

/** Comisión efectiva. Si ML no la reportó explícita (comision = 0) pero el
 * comprador pagó más que el valor del producto, esa diferencia es lo que
 * ML se quedó: comisión + envío a cargo del vendedor. Se descuenta el envío
 * si ya se conoce; mientras no, la diferencia completa se muestra como
 * comisión (el "te queda" sale bien en ambos casos). */
export function comisionOrden(o: MontosOrden) {
  if (o.comision > 0) return o.comision;
  const diferencia = totalVendidoOrden(o) - o.total;
  if (diferencia <= 0.5) return 0;
  return Math.max(0, redondearCentavos(diferencia - (o.costo_envio_vendedor ?? 0)));
}

/** De dónde salió la comisión, para explicarlo en pantalla. */
export function origenComisionOrden(o: MontosOrden & { comision_mp?: number | null }): "mercado_pago" | "sale_fee" | "derivada" | "ninguna" {
  if (o.comision > 0) return o.comision_mp && o.comision_mp > 0 ? "mercado_pago" : "sale_fee";
  return comisionOrden(o) > 0 ? "derivada" : "ninguna";
}

/** Lo que le queda a Isaac antes de su costo de producto. */
export function netoOrden(o: MontosOrden) {
  return redondearCentavos(totalVendidoOrden(o) - comisionOrden(o) - (o.costo_envio_vendedor ?? 0));
}

/** Reparte un monto de la orden entre sus renglones en proporción a lo
 * que vale cada uno (cantidad × precio unitario). */
export function parteDelRenglon(montoOrden: number, renglon: { cantidad: number; precio_unitario: number }, renglones: { cantidad: number; precio_unitario: number }[]) {
  const suma = renglones.reduce((s, r) => s + r.cantidad * r.precio_unitario, 0);
  if (suma <= 0) return renglones.length ? montoOrden / renglones.length : montoOrden;
  return redondearCentavos((montoOrden * renglon.cantidad * renglon.precio_unitario) / suma);
}

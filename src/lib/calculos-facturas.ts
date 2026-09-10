import type { FacturaPendiente, PagoFactura } from "./tipos";

/** Cuánto se ha pagado y cuánto falta de una factura — nunca se guarda a
 * mano, se calcula sumando sus pagos (mismo principio que saldo de cuenta,
 * saldo de socio, etc.). */
export function saldoFactura(factura: FacturaPendiente, pagos: PagoFactura[]) {
  const pagado = pagos.filter((p) => p.factura_id === factura.id).reduce((suma, p) => suma + p.monto, 0);
  return { pagado, saldo: factura.monto - pagado };
}

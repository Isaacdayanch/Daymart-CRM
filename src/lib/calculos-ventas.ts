// Cálculos del módulo de Ventas. Igual que en todo el sistema, nada de esto
// se guarda a mano: el total sale de las líneas y el saldo sale de los
// cobros registrados.

import { IVA_PCT, type CobroVenta, type Venta, type VentaLinea } from "./tipos";

export function subtotalVenta(lineas: VentaLinea[]) {
  return lineas.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0);
}

export function ivaVenta(venta: Pick<Venta, "con_iva">, lineas: VentaLinea[]) {
  return venta.con_iva ? subtotalVenta(lineas) * (IVA_PCT / 100) : 0;
}

export function totalVenta(venta: Pick<Venta, "con_iva">, lineas: VentaLinea[]) {
  return subtotalVenta(lineas) + ivaVenta(venta, lineas);
}

export function cobradoVenta(cobros: CobroVenta[]) {
  return cobros.reduce((s, c) => s + c.monto, 0);
}

export function saldoVenta(venta: Pick<Venta, "con_iva">, lineas: VentaLinea[], cobros: CobroVenta[]) {
  return totalVenta(venta, lineas) - cobradoVenta(cobros);
}

/** Costo de la mercancía vendida (al costo promedio que tenía cada SKU
 * cuando se vendió). */
export function costoVenta(lineas: VentaLinea[]) {
  return lineas.reduce((s, l) => s + l.cantidad * l.costo_unitario, 0);
}

/** Margen bruto en pesos (subtotal sin IVA − costo de la mercancía). El IVA
 * no es ganancia: se cobra para pagarlo, por eso se calcula sobre el subtotal. */
export function margenVenta(lineas: VentaLinea[]) {
  return subtotalVenta(lineas) - costoVenta(lineas);
}

export function margenVentaPct(lineas: VentaLinea[]) {
  const subtotal = subtotalVenta(lineas);
  return subtotal > 0 ? (margenVenta(lineas) / subtotal) * 100 : 0;
}

/** Una venta está "pagada" cuando su saldo es prácticamente cero (se
 * tolera un centavo por redondeos). */
export function ventaPagada(venta: Pick<Venta, "con_iva">, lineas: VentaLinea[], cobros: CobroVenta[]) {
  return saldoVenta(venta, lineas, cobros) <= 0.01;
}

export interface VentaConSaldo {
  venta: Venta;
  lineas: VentaLinea[];
  cobros: CobroVenta[];
  total: number;
  cobrado: number;
  saldo: number;
}

/** Arma, por venta, sus líneas, cobros y saldo — para no repetir el mismo
 * filtrado en cada pantalla. */
export function ventasConSaldo(ventas: Venta[], lineas: VentaLinea[], cobros: CobroVenta[]): VentaConSaldo[] {
  return ventas.map((venta) => {
    const suyas = lineas.filter((l) => l.venta_id === venta.id);
    const suyos = cobros.filter((c) => c.venta_id === venta.id);
    const total = totalVenta(venta, suyas);
    const cobrado = cobradoVenta(suyos);
    return { venta, lineas: suyas, cobros: suyos, total, cobrado, saldo: total - cobrado };
  });
}

export interface VentaPorVencer extends VentaConSaldo {
  vencida: boolean;
}

/** Ventas a crédito con saldo pendiente cuya fecha límite ya pasó o cae en
 * los próximos `diasAviso` días — para el aviso amarillo, igual que los
 * cargos de proveedores en Finanzas. */
export function ventasPorVencer(items: VentaConSaldo[], diasAviso: number, ahora = Date.now()): VentaPorVencer[] {
  const limite = ahora + diasAviso * 24 * 60 * 60 * 1000;
  return items
    .filter((v) => v.saldo > 0.01 && v.venta.fecha_limite && new Date(v.venta.fecha_limite).getTime() <= limite)
    .map((v) => ({ ...v, vencida: new Date(v.venta.fecha_limite!).getTime() < ahora }))
    .sort((a, b) => new Date(a.venta.fecha_limite!).getTime() - new Date(b.venta.fecha_limite!).getTime());
}

/** true si la venta todavía tiene saldo y su fecha límite ya pasó. */
export function ventaVencida(venta: Pick<Venta, "fecha_limite">, saldo: number, ahora = Date.now()) {
  return saldo > 0.01 && Boolean(venta.fecha_limite) && new Date(venta.fecha_limite!).getTime() < ahora;
}

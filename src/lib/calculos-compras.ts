// Cálculos del módulo de Compras (proveedores mexicanos). Igual que en todo
// el sistema, nada se guarda a mano: el total sale de las líneas, lo
// recibido de las recepciones y el saldo de los pagos de su cuenta por pagar.
//
// Regla de IVA (Isaac, 22 oct): el proveedor da el precio CON IVA incluido
// ("si me cuesta 30 pesos, ya tiene el IVA cargado"). Se captura tal cual y
// ese es el costo que entra al stock. El desglose sin IVA / IVA es solo
// informativo (para la factura).

import { IVA_PCT, type CondicionesPago, type OrdenCompra, type OrdenCompraLinea } from "./tipos";

export function subtotalOrden(lineas: Pick<OrdenCompraLinea, "cantidad" | "precio_unitario">[]) {
  return lineas.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0);
}

export function totalOrden(orden: Pick<OrdenCompra, "flete">, lineas: Pick<OrdenCompraLinea, "cantidad" | "precio_unitario">[]) {
  return subtotalOrden(lineas) + (orden.flete || 0);
}

/** Cuánto IVA viene "adentro" de un monto que ya lo incluye. */
export function ivaIncluido(monto: number) {
  return monto - monto / (1 + IVA_PCT / 100);
}

export function piezasPedidas(lineas: Pick<OrdenCompraLinea, "cantidad">[]) {
  return lineas.reduce((s, l) => s + l.cantidad, 0);
}

export function piezasRecibidas(lineas: Pick<OrdenCompraLinea, "cantidad_recibida">[]) {
  return lineas.reduce((s, l) => s + l.cantidad_recibida, 0);
}

export function piezasPendientes(lineas: Pick<OrdenCompraLinea, "cantidad" | "cantidad_recibida">[]) {
  return lineas.reduce((s, l) => s + Math.max(0, l.cantidad - l.cantidad_recibida), 0);
}

/** Lo que vale lo que SÍ ha llegado (más el flete completo en cuanto llega
 * algo): es el monto de la cuenta por pagar después de recibir. */
export function montoRecibido(orden: Pick<OrdenCompra, "flete">, lineas: Pick<OrdenCompraLinea, "cantidad_recibida" | "precio_unitario">[]) {
  const mercancia = lineas.reduce((s, l) => s + l.cantidad_recibida * l.precio_unitario, 0);
  return mercancia > 0 ? mercancia + (orden.flete || 0) : 0;
}

/** Costo por pieza que entra al stock: precio + la parte del flete que le
 * toca a esa línea (repartido en proporción a su valor; si todo vale 0, por
 * piezas). */
export function costoUnitarioConFlete(
  linea: Pick<OrdenCompraLinea, "cantidad" | "precio_unitario">,
  lineas: Pick<OrdenCompraLinea, "cantidad" | "precio_unitario">[],
  flete: number,
) {
  if (!(flete > 0) || !(linea.cantidad > 0)) return linea.precio_unitario;
  const subtotal = subtotalOrden(lineas);
  const piezas = piezasPedidas(lineas);
  const parte = subtotal > 0 ? ((linea.cantidad * linea.precio_unitario) / subtotal) * flete : piezas > 0 ? (linea.cantidad / piezas) * flete : 0;
  return linea.precio_unitario + parte / linea.cantidad;
}

/** Estado de la orden según lo recibido: nada → PEDIDA, algo → PARCIAL,
 * todo → RECIBIDA. */
export function estadoSegunRecibido(lineas: Pick<OrdenCompraLinea, "cantidad" | "cantidad_recibida">[]): "PEDIDA" | "PARCIAL" | "RECIBIDA" {
  const recibidas = piezasRecibidas(lineas);
  if (recibidas <= 0) return "PEDIDA";
  return lineas.every((l) => l.cantidad_recibida >= l.cantidad) ? "RECIBIDA" : "PARCIAL";
}

const DIA_MS = 24 * 60 * 60 * 1000;

function masDias(iso: string, dias: number) {
  return new Date(new Date(iso).getTime() + dias * DIA_MS).toISOString();
}

/** Para cuándo hay que pagar, según cómo cobra el proveedor:
 * - por adelantado → la fecha de la orden;
 * - al recibir → la fecha real de recepción si ya llegó, si no la prometida;
 * - a crédito → N días desde que se recibe (o desde la fecha prometida
 *   mientras no llegue). Null si no hay con qué calcularla. */
export function fechaLimitePago(
  condiciones: CondicionesPago,
  diasCredito: number | null,
  fechaOrden: string,
  fechaEntrega: string | null,
  recibidaEn: string | null,
): string | null {
  if (condiciones === "ANTICIPADO") return fechaOrden;
  const base = recibidaEn ?? fechaEntrega;
  if (!base) return null;
  if (condiciones === "AL_RECIBIR") return base;
  return masDias(base, Math.max(0, diasCredito ?? 0));
}

export interface OrdenPorRecibir<T extends Pick<OrdenCompra, "estado" | "fecha_entrega">> {
  orden: T;
  /** Ya pasó la fecha prometida y sigue sin llegar completa. */
  vencida: boolean;
  diasParaEntrega: number | null;
}

/** Órdenes que todavía esperan mercancía, la fecha de entrega más próxima
 * primero (sin fecha al final). `hoyTexto` = "AAAA-MM-DD" en CDMX. */
export function ordenesPorRecibir<T extends Pick<OrdenCompra, "estado" | "fecha_entrega">>(ordenes: T[], hoyTexto: string): OrdenPorRecibir<T>[] {
  const hoy = new Date(`${hoyTexto}T12:00:00Z`).getTime();
  return ordenes
    .filter((o) => o.estado === "PEDIDA" || o.estado === "PARCIAL")
    .map((o) => {
      if (!o.fecha_entrega) return { orden: o, vencida: false, diasParaEntrega: null };
      const entrega = new Date(`${o.fecha_entrega.slice(0, 10)}T12:00:00Z`).getTime();
      const dias = Math.round((entrega - hoy) / DIA_MS);
      return { orden: o, vencida: dias < 0, diasParaEntrega: dias };
    })
    .sort((a, b) => (a.diasParaEntrega ?? Infinity) - (b.diasParaEntrega ?? Infinity));
}

/** Texto corto para la fecha de entrega: "llega hoy", "en 3 días", "hace 2 días". */
export function textoEntrega(diasParaEntrega: number | null) {
  if (diasParaEntrega === null) return "sin fecha de entrega";
  if (diasParaEntrega === 0) return "llega hoy";
  if (diasParaEntrega === 1) return "llega mañana";
  if (diasParaEntrega > 1) return `llega en ${diasParaEntrega} días`;
  if (diasParaEntrega === -1) return "debía llegar ayer";
  return `debía llegar hace ${-diasParaEntrega} días`;
}

/** Texto de WhatsApp para mandarle la orden al proveedor (sin costos del
 * CRM: solo lo que el proveedor debe ver). */
export function textoOrdenWhatsApp(args: {
  numero: number;
  proveedor: string;
  fechaTexto: string;
  fechaEntregaTexto: string | null;
  lineas: Pick<OrdenCompraLinea, "nombre" | "cantidad" | "precio_unitario">[];
  flete: number;
  notasProveedor: string | null;
  entregarEn: string | null;
}) {
  const pesos = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  const renglones = args.lineas.map((l) => `• ${l.cantidad.toLocaleString("es-MX")} × ${l.nombre} — ${pesos(l.precio_unitario)} c/u`);
  const total = subtotalOrden(args.lineas) + (args.flete || 0);
  const partes = [
    `*Orden de compra #${args.numero} — Daymart*`,
    `Proveedor: ${args.proveedor}`,
    `Fecha: ${args.fechaTexto}`,
    args.fechaEntregaTexto ? `Entrega: ${args.fechaEntregaTexto}` : null,
    args.entregarEn ? `Entregar en: ${args.entregarEn}` : null,
    "",
    ...renglones,
    args.flete > 0 ? `• Flete: ${pesos(args.flete)}` : null,
    "",
    `*Total: ${pesos(total)}* (IVA incluido)`,
    args.notasProveedor ? `\n${args.notasProveedor}` : null,
  ];
  return partes.filter((p): p is string => p !== null).join("\n");
}

/** Cuentas por pagar de compras con saldo cuya fecha límite ya pasó o cae
 * en los próximos `diasAviso` días (para el aviso de arriba). */
export function pagosComprasPorVencer<T extends { saldo: number; orden: Pick<OrdenCompra, "estado">; factura: { fecha_limite: string | null } | null }>(
  ordenes: T[],
  diasAviso: number,
  ahora = Date.now(),
): { datos: T; vencido: boolean }[] {
  const limite = ahora + diasAviso * DIA_MS;
  return ordenes
    .filter((o) => o.saldo > 0.01 && o.orden.estado !== "CANCELADA" && o.factura?.fecha_limite && new Date(o.factura.fecha_limite).getTime() <= limite)
    .map((o) => ({ datos: o, vencido: new Date(o.factura!.fecha_limite!).getTime() < ahora }))
    .sort((a, b) => new Date(a.datos.factura!.fecha_limite!).getTime() - new Date(b.datos.factura!.fecha_limite!).getTime());
}

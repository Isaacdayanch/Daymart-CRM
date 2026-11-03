import type { ConceptoGastoContenedor, Contenedor, PagoGastoContenedor } from "./tipos";

/** Cálculos puros de los pagos de flete / aduana / otros gastos del
 * contenedor (migración 0062). Regla: lo que de verdad se pagó (pesos +
 * comisión) es el costo del concepto; en dólares, el tipo de cambio
 * efectivo = (pesos + comisión) ÷ dólares — igual que en los abonos de
 * mercancía vía cuenta puente. */

export function totalPagadoPesos(pago: Pick<PagoGastoContenedor, "monto_pesos" | "comision_pesos">) {
  return (Number(pago.monto_pesos) || 0) + (Number(pago.comision_pesos) || 0);
}

export function tipoCambioEfectivo(pesos: number, comision: number, dolares: number) {
  if (!(dolares > 0)) return 0;
  return (pesos + comision) / dolares;
}

export function totalesPagos(pagos: Pick<PagoGastoContenedor, "monto_pesos" | "comision_pesos" | "monto_dolares">[]) {
  return pagos.reduce(
    (acc, p) => ({ pesos: acc.pesos + totalPagadoPesos(p), dolares: acc.dolares + (Number(p.monto_dolares) || 0) }),
    { pesos: 0, dolares: 0 },
  );
}

export function pagosDelConcepto(pagos: PagoGastoContenedor[], concepto: ConceptoGastoContenedor) {
  return pagos.filter((p) => p.concepto === concepto);
}

type CamposGasto = Partial<
  Pick<
    Contenedor,
    | "flete_dolares"
    | "flete_tipo_cambio"
    | "flete_estimado"
    | "aduana_pesos"
    | "aduana_estimada"
    | "otros_gastos_dolares"
    | "otros_gastos_tipo_cambio"
    | "otros_gastos_estimado"
  >
>;

/** Lo que se escribe en el contenedor cuando un concepto queda PAGADO
 * COMPLETO: el monto pasa a ser la suma de sus pagos y deja de ser
 * estimado. Si ya no queda ningún pago (se quitaron todos), el monto se
 * conserva tal cual pero vuelve a ser estimado. */
export function camposContenedorDesdePagos(concepto: ConceptoGastoContenedor, pagos: PagoGastoContenedor[]): CamposGasto {
  const propios = pagosDelConcepto(pagos, concepto);
  const { pesos, dolares } = totalesPagos(propios);
  const sinPagos = propios.length === 0;
  const tc = dolares > 0 ? Math.round((pesos / dolares) * 10000) / 10000 : 0;
  switch (concepto) {
    case "FLETE":
      return sinPagos ? { flete_estimado: true } : { flete_dolares: dolares, flete_tipo_cambio: tc, flete_estimado: false };
    case "ADUANA":
      return sinPagos ? { aduana_estimada: true } : { aduana_pesos: Math.round(pesos * 100) / 100, aduana_estimada: false };
    case "OTROS":
      return sinPagos ? { otros_gastos_estimado: true } : { otros_gastos_dolares: dolares, otros_gastos_tipo_cambio: tc, otros_gastos_estimado: false };
  }
}

export type EstadoGasto = "ESTIMADO" | "PAGADO" | "REAL" | "SIN_MONTO";

/** Cómo está cada concepto en el contenedor:
 * - ESTIMADO: el monto es una estimación (todavía no hay pago completo).
 * - PAGADO: hay pagos registrados y el monto sale de ellos.
 * - REAL: no es estimado y no tiene pagos en el sistema (contenedores de
 *   antes, pagados fuera del sistema).
 * - SIN_MONTO: no hay monto ni pagos. */
export function estadoGasto(
  contenedor: Pick<Contenedor, "flete_dolares" | "flete_estimado" | "aduana_pesos" | "aduana_estimada" | "otros_gastos_dolares" | "otros_gastos_estimado">,
  concepto: ConceptoGastoContenedor,
  pagos: PagoGastoContenedor[],
): EstadoGasto {
  const propios = pagosDelConcepto(pagos, concepto);
  const monto = concepto === "FLETE" ? contenedor.flete_dolares : concepto === "ADUANA" ? contenedor.aduana_pesos : contenedor.otros_gastos_dolares;
  const estimado = concepto === "FLETE" ? contenedor.flete_estimado : concepto === "ADUANA" ? contenedor.aduana_estimada : contenedor.otros_gastos_estimado;
  if (estimado) return "ESTIMADO";
  if (propios.length > 0) return "PAGADO";
  if (!(Number(monto) > 0)) return "SIN_MONTO";
  return "REAL";
}

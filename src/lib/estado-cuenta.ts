// Estado de cuenta de UNA cuenta de Finanzas, como el del banco: saldo
// inicial del periodo, cada movimiento con entrada/salida y saldo corrido,
// y saldo final. Todo se deriva del libro de movimientos (nunca se guarda).

import { fechaTextoMx } from "./fechas-mx";
import type { Moneda, MovimientoFinanciero } from "./tipos";

export const CATEGORIA_AJUSTE = "Ajuste de saldo";

export interface RenglonEstadoCuenta {
  movimiento: MovimientoFinanciero;
  /** "AAAA-MM-DD" en calendario de Ciudad de México. */
  fecha: string;
  concepto: string;
  detalle: string | null;
  entrada: number;
  salida: number;
  saldo: number;
  esTransferencia: boolean;
  esAjuste: boolean;
}

export interface EstadoCuenta {
  saldoInicial: number;
  renglones: RenglonEstadoCuenta[];
  totalEntradas: number;
  totalSalidas: number;
  saldoFinal: number;
}

/** Cuánto suma (+) o resta (−) un movimiento a ESTA cuenta. */
function deltaCuenta(m: MovimientoFinanciero, cuentaId: string) {
  if (m.tipo === "ENTRADA") return m.cuenta_id === cuentaId ? m.monto : 0;
  if (m.tipo === "SALIDA") return m.cuenta_id === cuentaId ? -m.monto : 0;
  if (m.cuenta_id === cuentaId) return -m.monto;
  if (m.cuenta_destino_id === cuentaId) return m.monto;
  return 0;
}

export function estadoDeCuenta(opciones: {
  cuentaId: string;
  movimientos: MovimientoFinanciero[];
  moneda: Moneda;
  /** Periodo inclusivo, "AAAA-MM-DD". */
  desde: string;
  hasta: string;
  nombreCuenta: (id: string | null) => string;
  nombreCategoria: (id: string | null) => string | null;
}): EstadoCuenta {
  const { cuentaId, moneda, desde, hasta } = opciones;
  const propios = opciones.movimientos
    .filter((m) => m.moneda === moneda && (m.cuenta_id === cuentaId || m.cuenta_destino_id === cuentaId))
    .map((m) => ({ m, fecha: fechaTextoMx(new Date(m.fecha)) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.m.creado_en.localeCompare(b.m.creado_en));

  const saldoInicial = propios.filter((x) => x.fecha < desde).reduce((s, x) => s + deltaCuenta(x.m, cuentaId), 0);

  let saldo = saldoInicial;
  const renglones: RenglonEstadoCuenta[] = [];
  for (const { m, fecha } of propios) {
    if (fecha < desde || fecha > hasta) continue;
    const delta = deltaCuenta(m, cuentaId);
    saldo += delta;
    const esTransferencia = m.tipo === "TRANSFERENCIA";
    const categoria = opciones.nombreCategoria(m.categoria_id);
    const esAjuste = categoria === CATEGORIA_AJUSTE;
    const concepto = esTransferencia
      ? m.cuenta_id === cuentaId
        ? `Transferencia a ${opciones.nombreCuenta(m.cuenta_destino_id)}`
        : `Transferencia desde ${opciones.nombreCuenta(m.cuenta_id)}`
      : (categoria ?? "Sin categoría");
    renglones.push({
      movimiento: m,
      fecha,
      concepto,
      detalle: [m.contraparte, m.notas].filter(Boolean).join(" · ") || null,
      entrada: delta > 0 ? delta : 0,
      salida: delta < 0 ? -delta : 0,
      saldo,
      esTransferencia,
      esAjuste,
    });
  }

  return {
    saldoInicial,
    renglones,
    totalEntradas: renglones.reduce((s, r) => s + r.entrada, 0),
    totalSalidas: renglones.reduce((s, r) => s + r.salida, 0),
    saldoFinal: saldo,
  };
}

export interface Periodo {
  desde: string;
  hasta: string;
  etiqueta: string;
  /** "AAAA-MM" cuando el periodo es un mes completo. */
  mes: string | null;
  mesAnterior: string;
  mesSiguiente: string;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function ultimoDia(anio: number, mes: number) {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

function mesTexto(anio: number, mes: number) {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

function etiquetaMes(anio: number, mes: number) {
  const nombre = MESES[mes - 1];
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anio}`;
}

function etiquetaFecha(texto: string) {
  const [a, m, d] = texto.split("-").map(Number);
  return `${d} ${MESES[m - 1].slice(0, 3)} ${a}`;
}

/** Periodo a mostrar: `mes=AAAA-MM` (por defecto el mes actual en Ciudad de
 * México, el mes empieza en día 1) o `desde`/`hasta` libres. */
export function periodoDeParams(params: { mes?: string; desde?: string; hasta?: string }, hoyTexto: string): Periodo {
  const esFecha = (t?: string) => Boolean(t && /^\d{4}-\d{2}-\d{2}$/.test(t));
  if (esFecha(params.desde) && esFecha(params.hasta)) {
    const [desde, hasta] = params.desde! <= params.hasta! ? [params.desde!, params.hasta!] : [params.hasta!, params.desde!];
    const [a, m] = desde.split("-").map(Number);
    return {
      desde,
      hasta,
      etiqueta: `${etiquetaFecha(desde)} al ${etiquetaFecha(hasta)}`,
      mes: null,
      mesAnterior: m === 1 ? mesTexto(a - 1, 12) : mesTexto(a, m - 1),
      mesSiguiente: m === 12 ? mesTexto(a + 1, 1) : mesTexto(a, m + 1),
    };
  }
  const mes = params.mes && /^\d{4}-\d{2}$/.test(params.mes) ? params.mes : hoyTexto.slice(0, 7);
  const [a, m] = mes.split("-").map(Number);
  return {
    desde: `${mes}-01`,
    hasta: `${mes}-${String(ultimoDia(a, m)).padStart(2, "0")}`,
    etiqueta: etiquetaMes(a, m),
    mes,
    mesAnterior: m === 1 ? mesTexto(a - 1, 12) : mesTexto(a, m - 1),
    mesSiguiente: m === 12 ? mesTexto(a + 1, 1) : mesTexto(a, m + 1),
  };
}

/** Los mismos parámetros del periodo, listos para pegar en un link. */
export function queryPeriodo(p: Periodo) {
  return p.mes ? `mes=${p.mes}` : `desde=${p.desde}&hasta=${p.hasta}`;
}

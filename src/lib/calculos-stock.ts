// Cálculos del módulo de Stock. Todo se deriva del libro de movimientos
// (entradas/salidas/ajustes) — nunca se guarda un "stock actual" a mano,
// para que nunca se desfase de la realidad.

import type { MovimientoStock } from "./tipos";

export interface ResumenSku {
  sku: string;
  nombre: string;
  stockActual: number;
  stockPorBodega: Map<string, number>;
  costoPromedio: number;
  valorInventario: number;
  piezasPorCaja: number;
  cajas: number;
  rotacionDiaria: number;
  puntoReorden: number;
  necesitaReorden: boolean;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Cuánto suma o resta un movimiento al stock. Un AJUSTE ya trae su signo
 * (positivo si el conteo encontró más, negativo si encontró menos). */
function delta(m: MovimientoStock) {
  if (m.tipo === "ENTRADA") return m.cantidad;
  if (m.tipo === "SALIDA") return -m.cantidad;
  return m.cantidad;
}

function masReciente(movimientos: MovimientoStock[]) {
  return movimientos.reduce((a, b) => (new Date(b.creado_en) > new Date(a.creado_en) ? b : a));
}

/** Cantidad actual de un SKU: suma de entradas, menos salidas, más/menos ajustes. */
export function stockActual(movimientos: MovimientoStock[]) {
  return movimientos.reduce((suma, m) => suma + delta(m), 0);
}

/** Costo promedio ponderado de un SKU, según sus entradas (y ajustes que
 * suman) históricos — las salidas y ajustes que restan no cambian el costo
 * de lo que queda. */
export function costoPromedioPonderado(movimientos: MovimientoStock[]) {
  const entradas = movimientos.filter((m) => m.tipo === "ENTRADA" || (m.tipo === "AJUSTE" && m.cantidad > 0));
  const cantidadTotal = entradas.reduce((suma, m) => suma + m.cantidad, 0);
  if (!cantidadTotal) return 0;
  const valorTotal = entradas.reduce((suma, m) => suma + m.cantidad * m.costo_unitario_pesos, 0);
  return valorTotal / cantidadTotal;
}

/** Piezas que salieron por día, en promedio, dentro de la ventana de días
 * dada. Los ajustes NO cuentan aquí a propósito: son correcciones de
 * conteo, no ventas/envíos reales, y ensuciarían la rotación. */
export function rotacionDiaria(movimientos: MovimientoStock[], ventanaDias = 90) {
  const desde = Date.now() - ventanaDias * DIA_MS;
  const salidasEnVentana = movimientos
    .filter((m) => m.tipo === "SALIDA" && new Date(m.creado_en).getTime() >= desde)
    .reduce((suma, m) => suma + m.cantidad, 0);
  return salidasEnVentana / ventanaDias;
}

export function puntoReorden(rotacion: number, diasEspera: number) {
  return rotacion * diasEspera;
}

/** Arma el resumen por SKU a partir de todos los movimientos del negocio. */
export function resumenPorSku(movimientos: MovimientoStock[], diasEspera: number): ResumenSku[] {
  const porSku = new Map<string, MovimientoStock[]>();
  for (const m of movimientos) {
    const lista = porSku.get(m.sku) ?? [];
    lista.push(m);
    porSku.set(m.sku, lista);
  }

  const resumenes: ResumenSku[] = [];
  for (const [sku, movs] of porSku) {
    const stockPorBodega = new Map<string, number>();
    for (const m of movs) {
      stockPorBodega.set(m.bodega_id, (stockPorBodega.get(m.bodega_id) ?? 0) + delta(m));
    }

    const rotacion = rotacionDiaria(movs);
    const costoProm = costoPromedioPonderado(movs);
    const actual = stockActual(movs);
    const punto = puntoReorden(rotacion, diasEspera);

    // Piezas por caja: la de la entrada/ajuste más reciente (las salidas no
    // siempre la conocen con precisión, así que no se toman en cuenta aquí).
    const movsConEmpaque = movs.filter((m) => m.tipo === "ENTRADA" || m.tipo === "AJUSTE");
    const piezasPorCaja = movsConEmpaque.length ? masReciente(movsConEmpaque).piezas_por_caja || 1 : 1;

    resumenes.push({
      sku,
      nombre: masReciente(movs).nombre,
      stockActual: actual,
      stockPorBodega,
      costoPromedio: costoProm,
      valorInventario: actual * costoProm,
      piezasPorCaja,
      cajas: piezasPorCaja > 0 ? actual / piezasPorCaja : 0,
      rotacionDiaria: rotacion,
      puntoReorden: punto,
      necesitaReorden: actual <= punto,
    });
  }

  return resumenes.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export function valorTotalInventario(resumenes: ResumenSku[]) {
  return resumenes.reduce((suma, r) => suma + r.valorInventario, 0);
}

/** Compara lo que costó el contenedor contra lo que realmente entró a stock
 * (incluye correcciones posteriores por "Editar recepción"). */
export function reconciliacionContenedor(contenedorId: string, movimientos: MovimientoStock[]) {
  const valorEntradoStock = movimientos
    .filter((m) => m.contenedor_id === contenedorId && (m.tipo === "ENTRADA" || m.tipo === "AJUSTE"))
    .reduce((suma, m) => suma + m.cantidad * m.costo_unitario_pesos, 0);
  return valorEntradoStock;
}

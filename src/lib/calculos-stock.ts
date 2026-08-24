// Cálculos del módulo de Stock. Todo se deriva del libro de movimientos
// (entradas/salidas) — nunca se guarda un "stock actual" a mano, para que
// nunca se desfase de la realidad.

import type { MovimientoStock } from "./tipos";

export interface ResumenSku {
  sku: string;
  nombre: string;
  stockActual: number;
  stockPorBodega: Map<string, number>;
  costoPromedio: number;
  valorInventario: number;
  rotacionDiaria: number;
  puntoReorden: number;
  necesitaReorden: boolean;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Cantidad actual de un SKU: suma de entradas menos suma de salidas. */
export function stockActual(movimientos: MovimientoStock[]) {
  return movimientos.reduce(
    (suma, m) => suma + (m.tipo === "ENTRADA" ? m.cantidad : -m.cantidad),
    0,
  );
}

/** Costo promedio ponderado de un SKU, según todas sus entradas históricas. */
export function costoPromedioPonderado(movimientos: MovimientoStock[]) {
  const entradas = movimientos.filter((m) => m.tipo === "ENTRADA");
  const cantidadTotal = entradas.reduce((suma, m) => suma + m.cantidad, 0);
  if (!cantidadTotal) return 0;
  const valorTotal = entradas.reduce((suma, m) => suma + m.cantidad * m.costo_unitario_pesos, 0);
  return valorTotal / cantidadTotal;
}

/** Piezas que salieron por día, en promedio, dentro de la ventana de días dada. */
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
      const delta = m.tipo === "ENTRADA" ? m.cantidad : -m.cantidad;
      stockPorBodega.set(m.bodega_id, (stockPorBodega.get(m.bodega_id) ?? 0) + delta);
    }
    const rotacion = rotacionDiaria(movs);
    const costoProm = costoPromedioPonderado(movs);
    const actual = stockActual(movs);
    const punto = puntoReorden(rotacion, diasEspera);

    resumenes.push({
      sku,
      nombre: movs[movs.length - 1].nombre,
      stockActual: actual,
      stockPorBodega,
      costoPromedio: costoProm,
      valorInventario: actual * costoProm,
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

/** Compara lo que costó el contenedor contra lo que realmente entró a stock. */
export function reconciliacionContenedor(contenedorId: string, movimientos: MovimientoStock[]) {
  const valorEntradoStock = movimientos
    .filter((m) => m.tipo === "ENTRADA" && m.contenedor_id === contenedorId)
    .reduce((suma, m) => suma + m.cantidad * m.costo_unitario_pesos, 0);
  return valorEntradoStock;
}

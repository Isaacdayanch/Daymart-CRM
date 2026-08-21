// Fórmulas confirmadas contra el Excel real de Isaac (contenedores 10-15).
// Ver CLAUDE.md, sección "Cálculos", para la explicación de cada una.

import type { Contenedor, PagoMercancia, Producto } from "./tipos";

export function cartones(producto: Pick<Producto, "cantidad" | "piezas_por_caja">) {
  if (!producto.piezas_por_caja) return 0;
  return producto.cantidad / producto.piezas_por_caja;
}

export function cbmProducto(
  producto: Pick<Producto, "largo_cm" | "ancho_cm" | "alto_cm" | "cantidad" | "piezas_por_caja">,
) {
  const cajaCbm = (producto.largo_cm * producto.ancho_cm * producto.alto_cm) / 1_000_000;
  return cajaCbm * cartones(producto);
}

export function totalUsdProducto(producto: Pick<Producto, "precio_dolares" | "cantidad">) {
  return producto.precio_dolares * producto.cantidad;
}

export function cbmTotalContenedor(productos: Producto[]) {
  return productos.reduce((suma, p) => suma + cbmProducto(p), 0);
}

/** Flete convertido a pesos con su propio tipo de cambio. */
export function fletePesos(contenedor: Pick<Contenedor, "flete_dolares" | "flete_tipo_cambio">) {
  return contenedor.flete_dolares * contenedor.flete_tipo_cambio;
}

/** Total pagado de mercancía, en dólares y en pesos (según el tipo de cambio de cada abono). */
export function totalesMercancia(pagos: PagoMercancia[]) {
  const totalDolares = pagos.reduce((suma, p) => suma + p.monto_dolares, 0);
  const totalPesos = pagos.reduce((suma, p) => suma + p.monto_dolares * p.tipo_cambio, 0);
  return { totalDolares, totalPesos };
}

/** Tipo de cambio promedio ponderado de los abonos de mercancía. */
export function tipoCambioPromedioMercancia(pagos: PagoMercancia[]) {
  const { totalDolares, totalPesos } = totalesMercancia(pagos);
  if (!totalDolares) return 0;
  return totalPesos / totalDolares;
}

export function costoPorCbmContenedor(
  contenedor: Pick<Contenedor, "flete_dolares" | "flete_tipo_cambio" | "aduana_pesos">,
  productos: Producto[],
) {
  const cbmTotal = cbmTotalContenedor(productos);
  if (!cbmTotal) return 0;
  return (fletePesos(contenedor) + contenedor.aduana_pesos) / cbmTotal;
}

/** Gasto de flete+aduana repartido a este producto, por pieza. */
export function gastoRepartidoPorPieza(
  producto: Producto,
  costoPorCbm: number,
) {
  if (!producto.cantidad) return 0;
  return (cbmProducto(producto) * costoPorCbm) / producto.cantidad;
}

/** Costo final por pieza, en pesos: gasto repartido + precio en dólares al tipo de cambio promedio de mercancía. */
export function costoFinalPorPieza(
  producto: Producto,
  costoPorCbm: number,
  tipoCambioMercancia: number,
) {
  return gastoRepartidoPorPieza(producto, costoPorCbm) + producto.precio_dolares * tipoCambioMercancia;
}

/** Costo total del contenedor: flete + aduana + lo abonado de mercancía, todo en pesos. */
export function costoTotalContenedor(
  contenedor: Pick<Contenedor, "flete_dolares" | "flete_tipo_cambio" | "aduana_pesos">,
  pagosMercancia: PagoMercancia[],
) {
  const { totalPesos: mercanciaPesos } = totalesMercancia(pagosMercancia);
  return fletePesos(contenedor) + contenedor.aduana_pesos + mercanciaPesos;
}

/** SKU sugerido: 3 letras de la categoría + primeras 4 letras de hasta 3 palabras del nombre. */
export function skuSugerido(categoria: string, nombre: string) {
  const prefijo = categoria.trim().slice(0, 3).toUpperCase();
  const palabras = nombre
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((palabra) => palabra.slice(0, 4).toUpperCase());
  return [prefijo, ...palabras].filter(Boolean).join("-");
}

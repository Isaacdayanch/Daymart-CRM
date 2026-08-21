// Fórmulas confirmadas contra el Excel real de Isaac (contenedores 10-15).
// Ver CLAUDE.md, sección "Cálculos", para la explicación de cada una.

import type { Contenedor, Producto } from "./tipos";

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

export function costoPorCbmContenedor(
  contenedor: Pick<Contenedor, "flete" | "aduana">,
  productos: Producto[],
) {
  const cbmTotal = cbmTotalContenedor(productos);
  if (!cbmTotal) return 0;
  return (contenedor.flete + contenedor.aduana) / cbmTotal;
}

/** Gasto de flete+aduana repartido a este producto, por pieza. */
export function gastoRepartidoPorPieza(
  producto: Producto,
  costoPorCbm: number,
) {
  if (!producto.cantidad) return 0;
  return (cbmProducto(producto) * costoPorCbm) / producto.cantidad;
}

/** Costo final por pieza, en pesos: gasto repartido + precio en dólares convertido. */
export function costoFinalPorPieza(
  producto: Producto,
  contenedor: Pick<Contenedor, "tipo_cambio">,
  costoPorCbm: number,
) {
  return (
    gastoRepartidoPorPieza(producto, costoPorCbm) +
    producto.precio_dolares * contenedor.tipo_cambio
  );
}

/** Costo total del contenedor: flete + aduana + lo pagado en mercancía a proveedores. */
export function costoTotalContenedor(contenedor: Pick<Contenedor, "flete" | "aduana" | "mercancia">) {
  return contenedor.flete + contenedor.aduana + contenedor.mercancia;
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

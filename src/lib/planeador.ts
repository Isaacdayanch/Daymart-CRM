// Planeador de contenedores: cálculos puros (sin base de datos) para mover
// productos entre contenedores que todavía se están configurando.
//
// Isaac (26 oct): carga TODO lo que quiere traer en el contenedor que está
// configurando (se pasa del 100 %), y luego reparte: "pasarlo de contenedor
// con un drag and drop… crear el 17 así, según el peso y la urgencia".
// Solo participan contenedores en "Configurándose": un contenedor que ya
// salió de China no se puede reacomodar.

import { CAPACIDAD_CBM_DEFAULT, LIMITE_PESO_KG_DEFAULT, baseCostoContenedor, cbmProducto, ocupacionContenedor, pesoProducto, type OcupacionContenedor } from "./calculos";
import type { Contenedor, PagoMercancia, PrioridadProducto, Producto } from "./tipos";

/** Orden en que se muestran dentro de una columna: lo urgente arriba. */
export const PESO_PRIORIDAD: Record<PrioridadProducto, number> = { URGENTE: 0, NORMAL: 1, PUEDE_ESPERAR: 2 };

export function prioridadDe(producto: Pick<Producto, "prioridad">): PrioridadProducto {
  const p = producto.prioridad;
  return p === "URGENTE" || p === "PUEDE_ESPERAR" ? p : "NORMAL";
}

/** Urgente primero, luego normal, luego "puede esperar"; dentro de cada
 * grupo se respeta el orden que ya tenía el producto en su contenedor. */
export function ordenarPorPrioridad<T extends Pick<Producto, "prioridad" | "orden">>(productos: T[]): T[] {
  return [...productos].sort((a, b) => {
    const d = PESO_PRIORIDAD[prioridadDe(a)] - PESO_PRIORIDAD[prioridadDe(b)];
    return d !== 0 ? d : a.orden - b.orden;
  });
}

/** Cuántas piezas se pueden mover de un producto: entre 1 y lo que tiene. */
export function piezasAMover(producto: Pick<Producto, "cantidad">, pedidas: number) {
  const n = Math.floor(Number(pedidas) || 0);
  return Math.max(0, Math.min(n, producto.cantidad));
}

/** El mismo producto pero con otra cantidad (para calcular m³ y kg de una
 * parte, o para la fila nueva que se crea en el contenedor destino). */
export function productoConCantidad<T extends Producto>(producto: T, cantidad: number): T {
  return { ...producto, cantidad };
}

/** m³ y kg que ocupan `cantidad` piezas de este producto. */
export function espacioYPeso(producto: Producto, cantidad = producto.cantidad) {
  const parte = productoConCantidad(producto, cantidad);
  return { cbm: cbmProducto(parte), kg: pesoProducto(parte) };
}

/** Cómo quedaría el contenedor destino si se le agregan `cantidad` piezas
 * de `producto` (y el origen si se le quitan). */
export function ocupacionSiMueve(
  contenedor: Pick<Contenedor, "limite_peso_kg" | "capacidad_cbm">,
  productos: Producto[],
  producto: Producto,
  cantidad: number,
  sentido: "entra" | "sale",
): OcupacionContenedor {
  if (sentido === "entra") {
    return ocupacionContenedor(contenedor, [...productos, productoConCantidad(producto, cantidad)]);
  }
  const restantes = productos
    .map((p) => (p.id === producto.id ? productoConCantidad(p, p.cantidad - cantidad) : p))
    .filter((p) => p.cantidad > 0);
  return ocupacionContenedor(contenedor, restantes);
}

/** Lectura corta de una ocupación: "84 % espacio · 61 % peso". */
export function textoOcupacionCorto(o: Pick<OcupacionContenedor, "pctCbm" | "pctPeso">) {
  return `${Math.round(o.pctCbm)} % de espacio · ${Math.round(o.pctPeso)} % de peso`;
}

/** Frase roja de aviso cuando un contenedor está pasado. null si va bien. */
export function avisoExceso(o: Pick<OcupacionContenedor, "pctCbm" | "pctPeso">): string | null {
  const partes: string[] = [];
  if (o.pctCbm > 100) partes.push(`${Math.round(o.pctCbm)} % de su espacio`);
  if (o.pctPeso > 100) partes.push(`${Math.round(o.pctPeso)} % de su peso`);
  if (partes.length === 0) return null;
  return `Va al ${partes.join(" y al ")}: hay que pasar productos a otro contenedor.`;
}

/** Número para el contenedor nuevo: el más alto que exista + 1 (también
 * cuenta los que están en la papelera, para no repetir un número). */
export function siguienteNumeroContenedor(contenedores: Pick<Contenedor, "numero">[]) {
  const max = contenedores.reduce((m, c) => Math.max(m, Number(c.numero) || 0), 0);
  return max + 1;
}

/** Qué se copia del contenedor de origen al crear "el siguiente" desde el
 * planeador (Isaac: "copia todos los estimados al crear el próximo"): el
 * proveedor, el límite de peso y la capacidad, y el flete / aduana / otros
 * gastos con sus tipos de cambio y el tipo de cambio estimado — todos
 * marcados como ESTIMADOS, porque son una copia, no una factura. Los abonos
 * NO se copian (son dinero real del contenedor de origen). */
export function camposCopiadosDe(origen: Contenedor) {
  return {
    fabrica_principal: origen.fabrica_principal,
    proveedor_principal: origen.proveedor_principal,
    flete_dolares: Number(origen.flete_dolares) || 0,
    flete_tipo_cambio: Number(origen.flete_tipo_cambio) || 0,
    aduana_pesos: Number(origen.aduana_pesos) || 0,
    otros_gastos_dolares: Number(origen.otros_gastos_dolares) || 0,
    otros_gastos_tipo_cambio: Number(origen.otros_gastos_tipo_cambio) || 0,
    flete_estimado: (Number(origen.flete_dolares) || 0) > 0,
    aduana_estimada: (Number(origen.aduana_pesos) || 0) > 0,
    otros_gastos_estimado: (Number(origen.otros_gastos_dolares) || 0) > 0,
    credito_dias: origen.credito_dias ?? null,
    limite_peso_kg: Number(origen.limite_peso_kg) || LIMITE_PESO_KG_DEFAULT,
    capacidad_cbm: Number(origen.capacidad_cbm) || CAPACIDAD_CBM_DEFAULT,
    tipo_cambio_estimado: Number(origen.tipo_cambio_estimado) || null,
  };
}

/** Una columna del planeador: el contenedor con sus productos ya ordenados
 * por urgencia, su ocupación y su costo estimado por m³. */
export interface ColumnaPlaneador {
  contenedor: Contenedor;
  productos: Producto[];
  pagos: PagoMercancia[];
  ocupacion: OcupacionContenedor;
  costoPorCbm: number;
  costoEstimado: boolean;
  /** Suma del precio en dólares de la mercancía (precio × piezas). */
  totalUsd: number;
  /** Suma de los abonos de mercancía en dólares. */
  abonadoUsd: number;
}

export function armarColumna(contenedor: Contenedor, productos: Producto[], pagos: PagoMercancia[]): ColumnaPlaneador {
  const suyos = ordenarPorPrioridad(productos.filter((p) => p.contenedor_id === contenedor.id));
  const abonos = pagos.filter((p) => p.contenedor_id === contenedor.id);
  const base = baseCostoContenedor(contenedor, suyos, abonos);
  return {
    contenedor,
    productos: suyos,
    pagos: abonos,
    ocupacion: ocupacionContenedor(contenedor, suyos),
    costoPorCbm: base.costoPorCbm,
    costoEstimado: base.estimado,
    totalUsd: suyos.reduce((s, p) => s + (Number(p.precio_dolares) || 0) * p.cantidad, 0),
    abonadoUsd: abonos.reduce((s, a) => s + (Number(a.monto_dolares) || 0), 0),
  };
}

/** Los abonos se quedan en el contenedor de origen aunque la mercancía se
 * mueva: si ya se abonó MÁS de lo que vale lo que queda, hay que avisar. */
export function abonosExcedenMercancia(totalUsd: number, abonadoUsd: number) {
  return abonadoUsd > 0 && abonadoUsd > totalUsd + 0.01;
}

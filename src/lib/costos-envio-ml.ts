// Tabla oficial de costos de envío de Mercado Libre México (con reputación
// verde, la que aplica a Isaac), tal como la mandó él mismo desde la ayuda
// de Mercado Libre. "hastaKg" es el techo de cada fila (el peso a usar es
// el MAYOR entre el físico y el volumétrico). "normal" son los 6 rangos de
// precio de venta; "gratis" es el costo cuando se ofrece envío gratis
// (opcional, solo aplica a productos de menos de $299).

interface FilaEnvioMl {
  hastaKg: number;
  normal: number[];
  gratis: number;
}

const RANGOS_PRECIO = [98.99, 198.99, 298.99, 498.99, 998.99, Infinity];

const TABLA_ENVIOS_ML: FilaEnvioMl[] = [
  { hastaKg: 0.3, normal: [25, 32, 35, 52.4, 65.5, 65.5], gratis: 52.4 },
  { hastaKg: 0.5, normal: [28.5, 34, 38, 56, 70, 70], gratis: 56 },
  { hastaKg: 1, normal: [33, 38, 39, 59.6, 74.5, 74.5], gratis: 59.6 },
  { hastaKg: 2, normal: [35, 40, 41, 67.6, 84.5, 84.5], gratis: 67.6 },
  { hastaKg: 3, normal: [37, 46, 48, 76, 88.5, 95], gratis: 76 },
  { hastaKg: 4, normal: [39, 50, 54, 82.4, 95.5, 103], gratis: 82.4 },
  { hastaKg: 5, normal: [40, 53, 59, 88, 102.5, 110], gratis: 88 },
  { hastaKg: 7, normal: [45, 59, 70, 98, 122.5, 122.5], gratis: 98 },
  { hastaKg: 9, normal: [51, 67, 81, 111.6, 139.5, 139.5], gratis: 111.6 },
  { hastaKg: 12, normal: [59, 78, 96, 129.2, 161.5, 161.5], gratis: 129.2 },
  { hastaKg: 15, normal: [69, 92, 113, 152, 190, 190], gratis: 152 },
  { hastaKg: 20, normal: [81, 108, 140, 178, 222.5, 222.5], gratis: 178 },
  { hastaKg: 30, normal: [102, 137, 195, 225.2, 281.5, 281.5], gratis: 225.2 },
  { hastaKg: 40, normal: [126, 170, 250, 279.2, 349, 349], gratis: 279.2 },
  { hastaKg: 50, normal: [163, 220, 305, 361.2, 451.5, 451.5], gratis: 361.2 },
  { hastaKg: 60, normal: [183, 247, 334, 405.6, 507, 507], gratis: 405.6 },
  { hastaKg: 70, normal: [188, 254, 363, 416.4, 520.5, 520.5], gratis: 416.4 },
  { hastaKg: 80, normal: [196, 264, 392, 433.6, 542, 542], gratis: 433.6 },
  { hastaKg: 90, normal: [220, 297, 421, 487.6, 609.5, 609.5], gratis: 487.6 },
  { hastaKg: 100, normal: [254, 343, 450, 562.4, 703, 703], gratis: 562.4 },
  { hastaKg: 125, normal: [288, 389, 523, 637.2, 796.5, 796.5], gratis: 637.2 },
  { hastaKg: 150, normal: [382, 516, 694, 846, 1057.5, 1057.5], gratis: 846 },
  { hastaKg: 175, normal: [476, 643, 865, 1054.8, 1318.5, 1318.5], gratis: 1054.8 },
  { hastaKg: 200, normal: [570, 770, 1036, 1263.6, 1579.5, 1579.5], gratis: 1263.6 },
  { hastaKg: 225, normal: [664, 897, 1207, 1472.4, 1840.5, 1840.5], gratis: 1472.4 },
  { hastaKg: 250, normal: [758, 1024, 1378, 1681.2, 2101.5, 2101.5], gratis: 1681.2 },
  { hastaKg: 275, normal: [852, 1151, 1549, 1890, 2362.5, 2362.5], gratis: 1890 },
  { hastaKg: 300, normal: [946, 1278, 1720, 2098.4, 2623, 2623], gratis: 2098.4 },
  { hastaKg: 325, normal: [1040, 1406, 1892, 2308, 2885, 2885], gratis: 2308 },
  { hastaKg: 350, normal: [1134, 1533, 2063, 2516.8, 3146, 3146], gratis: 2516.8 },
  { hastaKg: Infinity, normal: [1134, 1533, 2063, 2516.8, 3146, 3146], gratis: 2516.8 },
];

/** (largo × ancho × alto en cm) ÷ 5000 — fórmula oficial de Mercado Libre. */
export function pesoVolumetricoKg(largoCm: number, anchoCm: number, altoCm: number) {
  return (largoCm * anchoCm * altoCm) / 5000;
}

function fila(pesoKg: number): FilaEnvioMl {
  return TABLA_ENVIOS_ML.find((f) => pesoKg <= f.hastaKg) ?? TABLA_ENVIOS_ML[TABLA_ENVIOS_ML.length - 1];
}

function columnaNormal(f: FilaEnvioMl, precioVenta: number) {
  const indice = RANGOS_PRECIO.findIndex((max) => precioVenta <= max);
  return f.normal[indice === -1 ? RANGOS_PRECIO.length - 1 : indice];
}

/** Costo estimado de envío de Mercado Libre para UNA pieza vendida, según
 * el paquete individual (no la caja de importación) — usa el peso que sea
 * mayor entre el físico (si se conoce) y el volumétrico calculado de las
 * medidas del paquete. Si se pide envío gratis y el precio ya pasa de $299
 * (donde la tabla de envío gratis ya no aplica), se usa la tabla normal.
 */
export function costoEnvioMercadoLibre({
  pesoFisicoKg,
  largoCm,
  anchoCm,
  altoCm,
  precioVenta,
  envioGratis,
}: {
  pesoFisicoKg?: number | null;
  largoCm: number;
  anchoCm: number;
  altoCm: number;
  precioVenta: number;
  envioGratis: boolean;
}) {
  const volumetrico = pesoVolumetricoKg(largoCm, anchoCm, altoCm);
  const peso = Math.max(pesoFisicoKg || 0, volumetrico);
  const f = fila(peso);

  if (envioGratis && precioVenta < 299) return f.gratis;
  return columnaNormal(f, precioVenta);
}

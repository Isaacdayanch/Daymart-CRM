// Cálculos de Research: costo estimado por pieza (misma lógica que un
// producto de contenedor, pero con un $/CBM que Isaac estima a mano en vez
// de que salga de un contenedor real) y el margen contra el precio de
// venta, la comisión de Mercado Libre y el costo de envío.

import { cbmProducto } from "./calculos";

export function costoEstimadoPorPiezaResearch({
  largoCm,
  anchoCm,
  altoCm,
  piezasPorCaja,
  costoPorCbmPesos,
  precioCompraDolares,
  tipoCambioEstimado,
}: {
  largoCm: number;
  anchoCm: number;
  altoCm: number;
  piezasPorCaja: number;
  costoPorCbmPesos: number;
  precioCompraDolares: number;
  tipoCambioEstimado: number;
}) {
  if (!piezasPorCaja) return precioCompraDolares * tipoCambioEstimado;
  const cbmCaja = cbmProducto({
    largo_cm: largoCm,
    ancho_cm: anchoCm,
    alto_cm: altoCm,
    cantidad: piezasPorCaja,
    piezas_por_caja: piezasPorCaja,
  });
  const gastoRepartido = (cbmCaja * costoPorCbmPesos) / piezasPorCaja;
  return gastoRepartido + precioCompraDolares * tipoCambioEstimado;
}

export function margenEstimadoResearch({
  precioVenta,
  comisionMlPct,
  costoEnvioPesos,
  costoEstimadoPiezaPesos,
}: {
  precioVenta: number;
  comisionMlPct: number;
  costoEnvioPesos: number;
  costoEstimadoPiezaPesos: number;
}) {
  const comision = precioVenta * (comisionMlPct / 100);
  const margenPesos = precioVenta - comision - costoEnvioPesos - costoEstimadoPiezaPesos;
  const margenPct = precioVenta > 0 ? (margenPesos / precioVenta) * 100 : 0;
  return { comision, margenPesos, margenPct };
}

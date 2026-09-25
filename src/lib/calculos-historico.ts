import type { MovimientoStock } from "@/lib/tipos";

/** Lo que YA está registrado en el sistema para un SKU (sin contar el
 * histórico): entradas = ENTRADAs + ajustes que suman; salidas = SALIDAs +
 * ajustes que restan. Sirve para que, cuando los totales de la hoja de
 * Isaac ya incluyen lo que el sistema tiene (ej. las 160 piezas del último
 * contenedor), el histórico se guarde solo por la diferencia y no se
 * cuente doble. `excluirManuales` = las entradas manuales que se van a
 * borrar por "reemplazar" no cuentan (ya no van a estar). */
export function registradoEnSistema(movimientos: MovimientoStock[], excluirManuales = false) {
  let entradas = 0;
  let salidas = 0;
  for (const m of movimientos) {
    if (m.historico) continue;
    const manual = m.tipo === "ENTRADA" && !m.contenedor_id && !m.venta_id;
    if (m.tipo === "ENTRADA") {
      if (!(excluirManuales && manual)) entradas += m.cantidad;
    } else if (m.tipo === "SALIDA") salidas += m.cantidad;
    else if (m.cantidad > 0) entradas += m.cantidad;
    else salidas += -m.cantidad;
  }
  return { entradas, salidas };
}

/** Histórico que de verdad se guarda: si los totales de la hoja ya
 * incluyen lo registrado, se resta (nunca queda negativo). */
export function historicoNeto(totales: { entradas: number; salidas: number }, registrado: { entradas: number; salidas: number }, restar: boolean) {
  if (!restar) return totales;
  return { entradas: Math.max(0, totales.entradas - registrado.entradas), salidas: Math.max(0, totales.salidas - registrado.salidas) };
}

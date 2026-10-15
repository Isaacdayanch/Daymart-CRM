/** Reglas puras sobre la comisión de una transacción de Finanzas.
 *
 * Caso real (15 oct): Isaac mandó $300,000 de BBVA a la cuenta puente con
 * $4,200 de comisión, pero capturó los $4,200 en el campo "monto neto que
 * llegó" — el sistema guardó la transferencia por $4,200 y la comisión por
 * $295,800, exactamente al revés. Ningún candado lo detuvo porque los dos
 * montos eran "válidos" (mayores a cero y menores al total). Una comisión
 * nunca es más de la mitad de lo que se mueve: si lo es, casi seguro los
 * montos están cruzados, y se avisa ANTES de guardar. */

/** Una comisión que se come más de la mitad del monto es sospechosa:
 * casi seguro se capturó el neto donde iba la comisión (o al revés). */
export function comisionSospechosa(comision: number, monto: number): boolean {
  if (!Number.isFinite(comision) || !Number.isFinite(monto) || monto <= 0) return false;
  return comision > monto / 2;
}

/** Mensaje para la pantalla y para el servidor (mismo texto en los dos
 * lados, para que Isaac vea lo mismo antes y después de darle Guardar). */
export function mensajeComisionSospechosa(comision: number, monto: number, formato: (n: number) => string): string {
  const neto = Math.round((monto - comision) * 100) / 100;
  return `Ojo: la comisión quedaría en ${formato(comision)} y solo llegarían ${formato(neto)} de ${formato(monto)}. Casi seguro los montos están al revés — revisa qué pusiste como comisión y qué como neto.`;
}

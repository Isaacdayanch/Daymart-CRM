// Código de barras Code 128 (subconjunto B), dibujado por el sistema sin
// librerías externas (principio de portabilidad). Code 128 es el formato
// estándar que leen todos los escáneres y el que usa Mercado Libre en sus
// etiquetas de Full; acepta letras, números y símbolos ASCII (32–126), que
// es todo lo que trae un "Código ML" como IBHA96856.
//
// Cómo se arma: START B + un símbolo por carácter + dígito verificador +
// STOP. Cada símbolo son 6 anchos alternando barra/espacio (el STOP trae 7)
// que suman 11 módulos (13 el STOP). Tabla oficial de patrones abajo.

const PATRONES = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const START_B = 104;
const STOP = 106;
/** Módulos en blanco a cada lado (zona de silencio que exige el estándar). */
export const ZONA_SILENCIO = 10;

/** true si el texto se puede codificar en Code 128 B (ASCII imprimible). */
export function sePuedeCodificar(texto: string): boolean {
  return texto.length > 0 && texto.length <= 80 && [...texto].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126);
}

/** Valores de los símbolos (start, datos, verificador, stop) para `texto`. */
export function simbolosCode128(texto: string): number[] {
  if (!sePuedeCodificar(texto)) throw new Error("El código solo puede traer letras, números y símbolos comunes (sin acentos).");
  const valores = [...texto].map((c) => c.charCodeAt(0) - 32);
  let suma = START_B;
  valores.forEach((v, i) => {
    suma += v * (i + 1);
  });
  return [START_B, ...valores, suma % 103, STOP];
}

export interface BarraCodigo {
  /** Posición (en módulos) desde el borde izquierdo, contando la zona de silencio. */
  x: number;
  /** Ancho en módulos. */
  ancho: number;
}

/** Barras negras del código (los espacios se omiten) y el ancho total en módulos. */
export function barrasCode128(texto: string): { barras: BarraCodigo[]; anchoTotal: number } {
  const barras: BarraCodigo[] = [];
  let x = ZONA_SILENCIO;
  for (const simbolo of simbolosCode128(texto)) {
    const patron = PATRONES[simbolo];
    for (let i = 0; i < patron.length; i++) {
      const ancho = Number(patron[i]);
      if (i % 2 === 0) barras.push({ x, ancho });
      x += ancho;
    }
  }
  return { barras, anchoTotal: x + ZONA_SILENCIO };
}

/** Solo para pruebas: cada patrón debe sumar 11 módulos (13 el STOP). */
export function tablaConsistente(): boolean {
  return PATRONES.every((p, i) => {
    const suma = [...p].reduce((s, c) => s + Number(c), 0);
    return i === STOP ? suma === 13 && p.length === 7 : suma === 11 && p.length === 6;
  });
}

// Mancuernas y otros productos que se compran POR PESO (migración 0053).
//
// Isaac (19 oct): "a veces vienen en libras, a veces en kilos (con el
// convertidor), a veces en pares y a veces sueltas, según cuántas vienen por
// caja". Regla de oro: en la base de datos TODO queda en piezas sueltas
// (cantidad, piezas por caja, precio en dólares por pieza, peso por pieza en
// kg), que es como se cuenta en bodega y como ya funciona todo el sistema
// (costo por pieza, stock, "piezas por unidad" de Mercado Libre). Estas
// funciones convierten lo que Isaac captura (15 lb, 20 pares, $1.20 por kg)
// a esas piezas sueltas, y de regreso para mostrarlo.

export const KG_POR_LB = 0.45359237;

export type UnidadPeso = "LB" | "KG";
export type ModoPrecio = "PIEZA" | "PAR" | "KG" | "LB";

export const UNIDADES_PESO: { valor: UnidadPeso; etiqueta: string }[] = [
  { valor: "LB", etiqueta: "libras (lb)" },
  { valor: "KG", etiqueta: "kilos (kg)" },
];

export const MODOS_PRECIO: { valor: ModoPrecio; etiqueta: string }[] = [
  { valor: "PIEZA", etiqueta: "por pieza suelta" },
  { valor: "PAR", etiqueta: "por par" },
  { valor: "KG", etiqueta: "por kilo" },
  { valor: "LB", etiqueta: "por libra" },
];

/** Columnas de la migración 0053 (en `productos` y `productos_catalogo`). */
export const COLUMNAS_MANCUERNA = ["es_mancuerna", "peso_unidad", "unidad_peso", "vendida_en_par", "precio_modo", "precio_capturado"] as const;

export interface CamposMancuerna {
  es_mancuerna?: boolean | null;
  /** Peso de CADA mancuerna en `unidad_peso` (ej. 15). */
  peso_unidad?: number | null;
  unidad_peso?: string | null;
  /** El proveedor la vende/cuenta por par. */
  vendida_en_par?: boolean | null;
  precio_modo?: string | null;
  /** El precio tal cual lo dio el proveedor, en la unidad de `precio_modo`. */
  precio_capturado?: number | null;
}

export function esMancuerna(p: CamposMancuerna | null | undefined): boolean {
  return Boolean(p?.es_mancuerna);
}

export function unidadPesoDe(valor: string | null | undefined): UnidadPeso {
  return valor === "KG" ? "KG" : "LB";
}

export function modoPrecioDe(valor: string | null | undefined): ModoPrecio {
  return valor === "PAR" || valor === "KG" || valor === "LB" ? valor : "PIEZA";
}

export function pesoEnKg(peso: number, unidad: string | null | undefined): number {
  return unidadPesoDe(unidad) === "LB" ? peso * KG_POR_LB : peso;
}

export function pesoEnLb(peso: number, unidad: string | null | undefined): number {
  return unidadPesoDe(unidad) === "KG" ? peso / KG_POR_LB : peso;
}

/** Precio en dólares por PIEZA SUELTA a partir del precio del proveedor
 * (por pieza, por par, por kilo o por libra) y el peso de cada mancuerna. */
export function precioPorPieza(precioCapturado: number, modo: string | null | undefined, peso: number, unidad: string | null | undefined): number {
  if (!(precioCapturado > 0)) return 0;
  switch (modoPrecioDe(modo)) {
    case "PAR":
      return precioCapturado / 2;
    case "KG":
      return precioCapturado * pesoEnKg(peso, unidad);
    case "LB":
      return precioCapturado * pesoEnLb(peso, unidad);
    default:
      return precioCapturado;
  }
}

/** 7.5 → "7.5", 15 → "15", 6.8039 → "6.8". */
export function numeroCorto(n: number, decimales = 1): string {
  if (!Number.isFinite(n)) return "0";
  const redondeado = Number(n.toFixed(decimales));
  return redondeado.toLocaleString("es-MX", { maximumFractionDigits: decimales });
}

/** "15 lb (6.8 kg)" o "7.5 kg (16.5 lb)". */
export function textoPeso(peso: number, unidad: string | null | undefined): string {
  if (!(peso > 0)) return "";
  return unidadPesoDe(unidad) === "LB" ? `${numeroCorto(peso)} lb (${numeroCorto(pesoEnKg(peso, unidad))} kg)` : `${numeroCorto(peso)} kg (${numeroCorto(pesoEnLb(peso, unidad))} lb)`;
}

/** Pastilla corta para listas: "15 lb (6.8 kg) · por par" / "· sueltas". Null si no es mancuerna. */
export function etiquetaMancuerna(p: CamposMancuerna | null | undefined): string | null {
  if (!esMancuerna(p)) return null;
  const peso = textoPeso(Number(p?.peso_unidad) || 0, p?.unidad_peso);
  const forma = p?.vendida_en_par ? "por par" : "sueltas";
  return [peso, forma].filter(Boolean).join(" · ");
}

/** "40 pzas (20 pares)" cuando se vende por par; si no, "40 pzas". */
export function textoCantidad(cantidad: number, p: CamposMancuerna | null | undefined): string {
  const pzas = `${cantidad.toLocaleString("es-MX")} pzas`;
  if (!esMancuerna(p) || !p?.vendida_en_par) return pzas;
  return `${pzas} (${numeroCorto(cantidad / 2)} pares)`;
}

/** Solo la parte entre paréntesis, para ponerla chiquita junto al número: "20 pares" o null. */
export function textoPares(cantidad: number, p: CamposMancuerna | null | undefined): string | null {
  if (!esMancuerna(p) || !p?.vendida_en_par) return null;
  return `${numeroCorto(cantidad / 2)} pares`;
}

/** Variante para armar el SKU: "15LB", "7.5KG" (se recorta a 4 en skuNuevo). */
export function varianteMancuerna(peso: number, unidad: string | null | undefined): string {
  if (!(peso > 0)) return "";
  return `${numeroCorto(peso).replace(",", ".")}${unidadPesoDe(unidad)}`;
}

/** Cómo texto para el precio: "$1.20 USD por kilo". */
export function textoModoPrecio(modo: string | null | undefined): string {
  return MODOS_PRECIO.find((m) => m.valor === modoPrecioDe(modo))?.etiqueta ?? "por pieza suelta";
}

export interface DerivadosMancuerna {
  /** Piezas sueltas (pares × 2 si se vende por par); undefined si el formulario no traía cantidad. */
  cantidad?: number;
  piezasPorCaja?: number;
  precioDolares: number;
  pesoKg: number | null;
}

export interface LecturaMancuerna {
  /** Los seis campos tal cual se guardan en la base. */
  campos: {
    es_mancuerna: boolean;
    peso_unidad: number | null;
    unidad_peso: UnidadPeso | null;
    vendida_en_par: boolean;
    precio_modo: ModoPrecio | null;
    precio_capturado: number | null;
  };
  /** Valores en piezas sueltas que reemplazan a los del formulario normal; null si no es mancuerna. */
  derivados: DerivadosMancuerna | null;
}

function numeroDe(formData: FormData, campo: string): number | undefined {
  const v = formData.get(campo);
  if (typeof v !== "string" || !v.trim()) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Lee el bloque "Es mancuerna" del formulario de producto y convierte a
 * piezas sueltas. Si la casilla no viene marcada, devuelve los campos en
 * blanco (así, al editar un producto y desmarcar la casilla, se limpian). */
export function leerMancuernaDeFormulario(formData: FormData): LecturaMancuerna {
  const activa = formData.get("es_mancuerna") === "1";
  if (!activa) {
    return {
      campos: { es_mancuerna: false, peso_unidad: null, unidad_peso: null, vendida_en_par: false, precio_modo: null, precio_capturado: null },
      derivados: null,
    };
  }
  const peso = numeroDe(formData, "peso_unidad") ?? 0;
  const unidad = unidadPesoDe(String(formData.get("unidad_peso") ?? ""));
  const par = formData.get("vendida_en_par") === "1";
  const modo = modoPrecioDe(String(formData.get("precio_modo") ?? ""));
  const precioCapturado = numeroDe(formData, "precio_capturado") ?? 0;

  const pares = numeroDe(formData, "cantidad_pares");
  const piezas = numeroDe(formData, "cantidad");
  const cantidad = par ? (pares !== undefined ? pares * 2 : piezas) : piezas;
  const paresCaja = numeroDe(formData, "pares_por_caja");
  const piezasCaja = numeroDe(formData, "piezas_por_caja");
  const piezasPorCaja = par ? (paresCaja !== undefined ? paresCaja * 2 : piezasCaja) : piezasCaja;

  return {
    campos: { es_mancuerna: true, peso_unidad: peso || null, unidad_peso: unidad, vendida_en_par: par, precio_modo: modo, precio_capturado: precioCapturado || null },
    derivados: {
      cantidad: cantidad !== undefined ? Math.round(cantidad) : undefined,
      piezasPorCaja: piezasPorCaja !== undefined ? Math.round(piezasPorCaja) : undefined,
      precioDolares: Number(precioPorPieza(precioCapturado, modo, peso, unidad).toFixed(4)),
      pesoKg: peso > 0 ? Number(pesoEnKg(peso, unidad).toFixed(3)) : null,
    },
  };
}

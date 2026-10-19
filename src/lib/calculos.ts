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

// --- Peso del contenedor (migración 0047) ---------------------------------
// El límite que importa no es el del contenedor (~26,500 kg físicos) sino el
// de la carretera en México: carga neta máxima de un 40' = 21,000 kg en
// camión normal, 23,000 con sobrecargo, 26,000 por tren (NOM-012 / navieras).

export const LIMITE_PESO_KG_DEFAULT = 21000;
/** Capacidad útil aproximada de un contenedor de 40' alto, en m³. */
export const CAPACIDAD_CBM_DEFAULT = 68;

export function pesoProducto(producto: Pick<Producto, "peso_kg" | "cantidad">) {
  return (Number(producto.peso_kg) || 0) * producto.cantidad;
}

export function pesoTotalContenedor(productos: Pick<Producto, "peso_kg" | "cantidad">[]) {
  return productos.reduce((suma, p) => suma + pesoProducto(p), 0);
}

export interface OcupacionContenedor {
  pesoKg: number;
  limitePesoKg: number;
  pctPeso: number;
  cbm: number;
  capacidadCbm: number;
  pctCbm: number;
  pesoRestanteKg: number;
  cbmRestante: number;
  /** Productos con cantidad pero sin peso capturado (el total está incompleto). */
  sinPeso: number;
  /** Lectura en una línea de cómo va la combinación peso / espacio. */
  aviso: string;
  nivel: "ok" | "atencion" | "excedido";
}

function kg(n: number) {
  return `${Math.round(n).toLocaleString("es-MX")} kg`;
}
function m3(n: number) {
  return `${n.toFixed(1)} m³`;
}

/** Cómo va el contenedor en peso y en espacio, y qué conviene meter
 * todavía: si sobra espacio pero falta peso, carga ligera; si sobra peso
 * pero falta espacio, carga densa. */
export function ocupacionContenedor(
  contenedor: Pick<Contenedor, "limite_peso_kg" | "capacidad_cbm">,
  productos: Producto[],
): OcupacionContenedor {
  const limitePesoKg = Number(contenedor.limite_peso_kg) || LIMITE_PESO_KG_DEFAULT;
  const capacidadCbm = Number(contenedor.capacidad_cbm) || CAPACIDAD_CBM_DEFAULT;
  const pesoKg = pesoTotalContenedor(productos);
  const cbm = cbmTotalContenedor(productos);
  const pctPeso = limitePesoKg ? (pesoKg / limitePesoKg) * 100 : 0;
  const pctCbm = capacidadCbm ? (cbm / capacidadCbm) * 100 : 0;
  const pesoRestanteKg = limitePesoKg - pesoKg;
  const cbmRestante = capacidadCbm - cbm;
  const sinPeso = productos.filter((p) => p.cantidad > 0 && !(Number(p.peso_kg) > 0)).length;

  let nivel: OcupacionContenedor["nivel"] = "ok";
  let aviso: string;
  if (pctPeso > 100 && pctCbm > 100) {
    nivel = "excedido";
    aviso = `Te pasas de peso por ${kg(-pesoRestanteKg)} y de espacio por ${m3(-cbmRestante)}.`;
  } else if (pctPeso > 100) {
    nivel = "excedido";
    aviso = `Te pasas de peso por ${kg(-pesoRestanteKg)} aunque te sobren ${m3(Math.max(cbmRestante, 0))}: quita carga pesada o pide autorización de más peso (23,000 kg con sobrecargo).`;
  } else if (pctCbm > 100) {
    nivel = "excedido";
    aviso = `Te pasas de espacio por ${m3(-cbmRestante)} aunque te sobren ${kg(pesoRestanteKg)} de peso.`;
  } else if (pesoKg === 0 && cbm === 0) {
    aviso = "Todavía no hay productos.";
  } else if (pctPeso >= pctCbm + 10) {
    // El peso se acaba antes que el espacio: lo que falte debe ser ligero.
    nivel = pctPeso >= 90 ? "atencion" : "ok";
    const densidadMax = cbmRestante > 0 ? pesoRestanteKg / cbmRestante : 0;
    aviso = `Te sobra espacio pero te falta peso: te quedan ${m3(cbmRestante)} y solo ${kg(pesoRestanteKg)}. Lo que agregues tiene que ser ligero (máx. ${Math.round(densidadMax).toLocaleString("es-MX")} kg por m³, ej. espejos, yoga, hogar).`;
  } else if (pctCbm >= pctPeso + 10) {
    nivel = pctCbm >= 90 ? "atencion" : "ok";
    aviso = `Te sobra peso pero te falta espacio: te quedan ${kg(pesoRestanteKg)} y solo ${m3(cbmRestante)}. Conviene llenar con carga densa (ej. mancuernas, discos).`;
  } else {
    nivel = pctPeso >= 90 || pctCbm >= 90 ? "atencion" : "ok";
    aviso = `Peso y espacio van parejos: te quedan ${kg(pesoRestanteKg)} y ${m3(cbmRestante)}.`;
  }
  if (sinPeso > 0) aviso += ` Ojo: ${sinPeso} producto(s) sin peso capturado — el total real es mayor.`;
  return { pesoKg, limitePesoKg, pctPeso, cbm, capacidadCbm, pctCbm, pesoRestanteKg, cbmRestante, sinPeso, aviso, nivel };
}

/** Flete convertido a pesos con su propio tipo de cambio. */
export function fletePesos(contenedor: Pick<Contenedor, "flete_dolares" | "flete_tipo_cambio">) {
  return contenedor.flete_dolares * contenedor.flete_tipo_cambio;
}

/** Otros gastos (fletes internos en China, etc.) convertidos a pesos con su propio tipo de cambio. */
export function otrosGastosPesos(
  contenedor: Pick<Contenedor, "otros_gastos_dolares" | "otros_gastos_tipo_cambio">,
) {
  return contenedor.otros_gastos_dolares * contenedor.otros_gastos_tipo_cambio;
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
  contenedor: Pick<
    Contenedor,
    "flete_dolares" | "flete_tipo_cambio" | "aduana_pesos" | "otros_gastos_dolares" | "otros_gastos_tipo_cambio"
  >,
  productos: Producto[],
) {
  const cbmTotal = cbmTotalContenedor(productos);
  if (!cbmTotal) return 0;
  return (fletePesos(contenedor) + contenedor.aduana_pesos + otrosGastosPesos(contenedor)) / cbmTotal;
}

// --- Costo estimado mientras el contenedor se configura (migración 0052) ---
// Isaac (18 oct): "no puedo ver el costo de los productos hasta no terminar de
// configurar el contenedor… con un solo producto no se ve bien". Con pocos
// productos, TODO el flete y la aduana caían sobre ellos (se dividen entre el
// CBM cargado). Mientras el contenedor está "Configurándose" y no se ha
// marcado terminado, se reparten como si el contenedor fuera lleno
// (`capacidad_cbm`, 68 m³ por defecto): cada producto nuevo ya da una idea
// real de su costo. Si todavía no hay abonos de mercancía, el tipo de cambio
// sale de `tipo_cambio_estimado` (o del flete). Al "Terminar de configurar"
// (o al pasar a En tránsito) el reparto es sobre los m³ reales.

export interface BaseCostoContenedor {
  costoPorCbm: number;
  tipoCambio: number;
  /** true mientras algún dato sea una aproximación (capacidad o tipo de cambio estimado). */
  estimado: boolean;
  /** Una línea por cada aproximación aplicada, en lenguaje de Isaac. */
  motivos: string[];
  /** m³ entre los que se repartió flete + aduana + otros gastos. */
  cbmBase: number;
  /** m³ que de verdad llevan los productos capturados. */
  cbmReal: number;
  /** Capacidad del contenedor (68 m³ por defecto). */
  capacidadCbm: number;
  /** Flete + aduana + otros gastos, en pesos. */
  gastos: number;
  /** El contenedor sigue en configuración (estimación por capacidad activa). */
  enConfiguracion: boolean;
}

export function enConfiguracion(contenedor: Pick<Contenedor, "estado" | "configuracion_terminada_en">) {
  return contenedor.estado === "CONFIGURANDOSE" && !contenedor.configuracion_terminada_en;
}

export function baseCostoContenedor(
  contenedor: Pick<
    Contenedor,
    "estado" | "configuracion_terminada_en" | "capacidad_cbm" | "tipo_cambio_estimado" | "flete_dolares" | "flete_tipo_cambio" | "aduana_pesos" | "otros_gastos_dolares" | "otros_gastos_tipo_cambio"
  >,
  productos: Producto[],
  pagos: PagoMercancia[],
): BaseCostoContenedor {
  const cbmReal = cbmTotalContenedor(productos);
  const gastos = fletePesos(contenedor) + contenedor.aduana_pesos + otrosGastosPesos(contenedor);
  const configurando = enConfiguracion(contenedor);
  const motivos: string[] = [];
  let cbmBase = cbmReal;
  const capacidad = Number(contenedor.capacidad_cbm) || CAPACIDAD_CBM_DEFAULT;
  if (configurando) {
    if (cbmReal < capacidad) {
      cbmBase = capacidad;
      motivos.push(`el flete y la aduana se reparten como si el contenedor fuera lleno (${capacidad} m³; llevas ${cbmReal.toFixed(2)} m³)`);
    }
  }
  const costoPorCbm = cbmBase > 0 ? gastos / cbmBase : 0;
  if (gastos <= 0) motivos.push("todavía no hay flete ni aduana capturados: el costo por pieza solo trae el precio del producto");
  let tipoCambio = tipoCambioPromedioMercancia(pagos);
  if (!tipoCambio) {
    const estimadoTc = Number(contenedor.tipo_cambio_estimado) || Number(contenedor.flete_tipo_cambio) || 0;
    tipoCambio = estimadoTc;
    motivos.push(
      estimadoTc
        ? `tipo de cambio estimado de ${estimadoTc.toFixed(2)} (todavía no hay abonos de mercancía)`
        : "no hay abonos ni tipo de cambio estimado: el precio en dólares se está contando en $0 — pon un tipo de cambio estimado en Editar",
    );
  }
  return { costoPorCbm, tipoCambio, estimado: motivos.length > 0, motivos, cbmBase, cbmReal, capacidadCbm: capacidad, gastos, enConfiguracion: configurando };
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

/** Costo total del contenedor: flete + aduana + otros gastos + lo abonado de mercancía, todo en pesos. */
export function costoTotalContenedor(
  contenedor: Pick<
    Contenedor,
    "flete_dolares" | "flete_tipo_cambio" | "aduana_pesos" | "otros_gastos_dolares" | "otros_gastos_tipo_cambio"
  >,
  pagosMercancia: PagoMercancia[],
) {
  const { totalPesos: mercanciaPesos } = totalesMercancia(pagosMercancia);
  return fletePesos(contenedor) + contenedor.aduana_pesos + otrosGastosPesos(contenedor) + mercanciaPesos;
}

/** SKU sugerido (regla vieja): 3 letras de la categoría + primeras 4 letras
 * de hasta 3 palabras del nombre. Se conserva para los productos que ya
 * existen; los nuevos usan `skuNuevo`. */
export function skuSugerido(categoria: string, nombre: string) {
  const prefijo = categoria.trim().slice(0, 3).toUpperCase();
  const palabras = nombre
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((palabra) => palabra.slice(0, 4).toUpperCase());
  return [prefijo, ...palabras].filter(Boolean).join("-");
}

const PALABRAS_VACIAS = new Set(["DE", "DEL", "LA", "EL", "LOS", "LAS", "PARA", "CON", "Y", "O", "EN", "UN", "UNA", "POR", "A", "AL"]);

/** Quita acentos, deja solo letras/números en mayúsculas. */
export function normalizarParaSku(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ");
}

/** Parte "producto" del SKU: 4 letras de las dos primeras palabras que
 * importan del nombre ("Bloques de yoga" → BLOQYOGA). */
export function codigoProductoSku(nombre: string) {
  const palabras = normalizarParaSku(nombre)
    .split(/\s+/)
    .filter((p) => p && !PALABRAS_VACIAS.has(p));
  return palabras
    .slice(0, 2)
    .map((p) => p.slice(0, 4))
    .join("");
}

/** SKU nuevo (Isaac, 23 sep): MARCA-PRODUCTO-VARIANTE. Corto, sin categoría
 * ni línea adentro: en el SKU solo va lo que nunca cambia. La variante
 * (color, talla, medida) es opcional y se recorta a 4 caracteres. */
export function skuNuevo(codigoMarca: string, nombre: string, variante?: string | null) {
  const marca = normalizarParaSku(codigoMarca).replace(/\s+/g, "").slice(0, 4);
  const producto = codigoProductoSku(nombre);
  const var4 = variante ? normalizarParaSku(variante).replace(/\s+/g, "").slice(0, 4) : "";
  return [marca, producto, var4].filter(Boolean).join("-");
}

/** Si el SKU ya existe, le agrega -2, -3… hasta encontrar uno libre. */
export function skuLibre(sku: string, existentes: Set<string>) {
  if (!existentes.has(sku)) return sku;
  for (let n = 2; n < 100; n++) {
    const candidato = `${sku}-${n}`;
    if (!existentes.has(candidato)) return candidato;
  }
  return `${sku}-${Date.now()}`;
}

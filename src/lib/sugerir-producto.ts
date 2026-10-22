// Propuesta "creo que es X" al ligar una publicación de ML con un producto
// del CRM: palabras en común entre el título de ML y el nombre del CRM. Puro
// (sin base de datos), para usarlo también en pantallas del navegador.

const VACIAS = new Set(["DE", "DEL", "LA", "EL", "LOS", "LAS", "PARA", "CON", "Y", "O", "EN", "UN", "UNA", "POR", "A", "AL", "COLOR", "DAYMART", "GYM", "CASA", "PIEZAS", "PZAS", "KG", "CM", "MM"]);

function tokens(texto: string | null | undefined) {
  return new Set(
    (texto ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter((t) => t.length >= 3 && !VACIAS.has(t)),
  );
}

/** Puntos de parecido entre una publicación (título + variante + SKU de ML)
 * y un producto del CRM (nombre + SKU): palabras en común. */
export function puntosParecido(pub: { titulo: string | null; variacion: string | null; sellerSku: string }, prod: { sku: string; nombre: string }) {
  const a = tokens(`${pub.titulo ?? ""} ${pub.variacion ?? ""}`);
  const b = tokens(prod.nombre);
  let puntos = 0;
  for (const t of a) if (b.has(t)) puntos += 1;
  // Partes del SKU de ML que aparecen en el SKU del CRM (ej. BANC, ROMAN).
  const partesMl = pub.sellerSku.toUpperCase().split(/[^A-Z0-9]+/).filter((p) => p.length >= 3);
  const skuCrm = prod.sku.toUpperCase();
  for (const parte of partesMl) if (skuCrm.includes(parte)) puntos += 1.5;
  return puntos;
}

export function sugerirProducto(pub: { titulo: string | null; variacion: string | null; sellerSku: string }, productos: { sku: string; nombre: string }[]) {
  let mejor: { sku: string; nombre: string; puntos: number } | null = null;
  for (const p of productos) {
    const puntos = puntosParecido(pub, p);
    if (puntos >= 2 && (!mejor || puntos > mejor.puntos)) mejor = { sku: p.sku, nombre: p.nombre, puntos };
  }
  return mejor;
}

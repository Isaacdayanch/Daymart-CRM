// Reglas puras de una respuesta a Mercado Libre (se usan en la pantalla y
// en el servidor, sin cargar la librería de la IA).

/** Lo que Mercado Libre no deja poner en una respuesta (y la rechaza o
 * penaliza). Devuelve el problema o null. */
export function problemaEnRespuesta(texto: string): string | null {
  const t = texto.trim();
  if (!t) return "La respuesta está vacía.";
  if (t.length > 2000) return `Mercado Libre acepta máximo 2,000 caracteres (llevas ${t.length}).`;
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(t)) return "Quita el correo: Mercado Libre no deja poner datos de contacto.";
  if (/(https?:\/\/|www\.|\.com\b|\.mx\b)/i.test(t)) return "Quita el link: Mercado Libre no deja poner links en las respuestas.";
  if (/(\d[\s.-]?){8,}/.test(t)) return "Parece que hay un teléfono: Mercado Libre no deja poner datos de contacto.";
  if (/(whats\s?app|wasap|facebook|instagram|telegram)/i.test(t)) return "Quita la red social: Mercado Libre no deja pedir contacto por fuera.";
  return null;
}

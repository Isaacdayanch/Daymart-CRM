// Borradores de respuesta a preguntas de Mercado Libre con Claude (21 oct).
//
// Solo REDACTA: nunca manda nada a ML. Isaac aprueba, corrige o descarta
// cada borrador en Mercado Libre → Atención a clientes.
//
// Llave: ANTHROPIC_API_KEY (variable de entorno en Vercel, nunca en el repo).
// Modelo: Claude Opus 5.5. Si el modelo se niega a contestar por políticas,
// `fallbacks: "default"` lo reintenta solo con otro modelo dentro de la misma
// llamada (opción de la API para no quedarse sin borrador).

import Anthropic from "@anthropic-ai/sdk";

export const MODELO_IA = "claude-opus-5-5";

export const CATEGORIAS_PREGUNTA = ["disponibilidad", "medidas", "envio", "precio", "garantia", "uso", "factura", "compatibilidad", "otro"] as const;
export type CategoriaPregunta = (typeof CATEGORIAS_PREGUNTA)[number];
export type Confianza = "alta" | "media" | "baja";

export interface BorradorIa {
  respuesta: string;
  confianza: Confianza;
  categoria: CategoriaPregunta;
  /** Para Isaac: qué dato le faltó o por qué no está segura. */
  nota: string;
}

export interface ContextoPregunta {
  pregunta: string;
  fecha: string;
  publicacion: {
    itemId: string;
    titulo: string;
    precio: number | null;
    variantes: { variacion: string | null; disponible: number | null; enFull: boolean }[];
    descripcion: string | null;
    atributos: string[];
    garantia: string | null;
    envioGratis: boolean | null;
  };
  /** Ficha del CRM del producto ligado (si está ligado). */
  ficha: { nombre: string; descripcion: string | null; pesoKg: number | null; memo: string | null; enBodega: number | null } | null;
  /** Preguntas anteriores de ESTA publicación ya respondidas. */
  anterioresDelProducto: { pregunta: string; respuesta: string }[];
  /** Borradores que Isaac corrigió (de cualquier producto): de aquí aprende el estilo. */
  correcciones: { pregunta: string; borrador: string; final: string }[];
  /** Otras respuestas recientes de Isaac, para copiar su tono. */
  ejemplos: { pregunta: string; respuesta: string }[];
  reglas: string | null;
  /** Indicación de Isaac al pedir "volver a redactar" (ej. "dile que sí hay en negro"). */
  indicacion: string | null;
}

/** Precio de Claude Opus 5.5 en dólares por millón de tokens. Escribir en
 * caché cuesta 1.25× la entrada; leer de caché, 0.1×. */
const PRECIO = { entrada: 4, salida: 20, cacheEscritura: 5, cacheLectura: 0.4 };

/** Lo más que puede costar UNA respuesta (contexto grande + salida al tope):
 * se aparta antes de llamar para que el tope diario nunca se pase. */
export const COSTO_MAXIMO_RESPUESTA = 0.15;

interface UsoTokens {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function costoDeUso(u: UsoTokens) {
  return (
    ((u.input_tokens ?? 0) * PRECIO.entrada +
      (u.output_tokens ?? 0) * PRECIO.salida +
      (u.cache_creation_input_tokens ?? 0) * PRECIO.cacheEscritura +
      (u.cache_read_input_tokens ?? 0) * PRECIO.cacheLectura) /
    1_000_000
  );
}

/** Error de la IA que ya costó algo (se cobró aunque no sirviera). */
export class ErrorIa extends Error {
  constructor(
    mensaje: string,
    public costoUsd = 0,
  ) {
    super(mensaje);
  }
}

export function iaConfigurada() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SISTEMA = `Eres quien contesta las preguntas de los compradores en la tienda de Mercado Libre México de Daymart (equipo de gym y fitness, artículos para el hogar, espejos, cocina y exteriores; también la marca propia Mamey).

Tu trabajo: escribir el BORRADOR de la respuesta a una pregunta. El dueño, Isaac, lo revisa antes de mandarlo, así que sé honesto sobre qué tan seguro estás.

Cómo escribir la respuesta:
- Español de México, tratando al cliente de TÚ, cálido y directo, como un vendedor que conoce bien su producto. Nada de "usted".
- Corta: casi siempre 1 a 3 frases. Contesta exactamente lo que preguntaron, primero la respuesta (sí/no/el dato) y luego, si ayuda, un detalle útil.
- Empieza con "¡Hola!" y termina con algo breve y amable (por ejemplo "¡Saludos!" o invitando a comprar), sin exagerar con emojis (máximo uno, opcional).
- Usa SOLO los datos que vienen en el contexto (publicación, ficha, stock, reglas de la casa y respuestas anteriores). Nunca inventes medidas, materiales, tiempos de entrega, garantías ni compatibilidades. Si el dato no está, no lo adivines: escribe una respuesta prudente y pon confianza "baja" explicando qué falta.
- Mercado Libre prohíbe en las respuestas: teléfonos, correos, links, redes sociales, nombres de otras tiendas y pedir que compren fuera de la plataforma. Nunca los incluyas.
- Precio, descuentos, regateo, "precio de mayoreo" o ventas por fuera: no prometas nada distinto a lo publicado. Pon categoría "precio" y confianza "baja" para que Isaac decida.
- Disponibilidad: usa el stock del contexto. Si hay piezas, di que sí hay y que pueden comprar directo en la publicación. Si una variante (color/medida) está en 0, dilo con amabilidad. No digas cantidades exactas salvo que pregunten cuántas hay.
- Garantía, devoluciones, quejas, clientes molestos o algo que suene a problema: confianza "baja".
- Si la pregunta no tiene que ver con el producto o no se entiende, contesta pidiendo amablemente que la aclare.
- Si Isaac te dio una indicación para esta pregunta, síguela.
- Las reglas de la casa y las correcciones de Isaac mandan sobre tu estilo por defecto: imita cómo él corrige.

La respuesta no puede pasar de 2,000 caracteres (límite de Mercado Libre); idealmente menos de 350.

Confianza:
- "alta": el dato está claro en el contexto y la respuesta se puede mandar tal cual.
- "media": la respuesta es razonable pero conviene que Isaac la lea (dato deducido, pregunta ambigua).
- "baja": falta información, es de precio/garantía/queja, o no estás seguro.

En "nota" escribe, en una frase corta para Isaac, qué dato te faltó o por qué dudas (vacía si la confianza es alta).`;

const ESQUEMA = {
  type: "object",
  properties: {
    respuesta: { type: "string", description: "El texto que se le mandaría al comprador." },
    confianza: { type: "string", enum: ["alta", "media", "baja"] },
    categoria: { type: "string", enum: [...CATEGORIAS_PREGUNTA] },
    nota: { type: "string", description: "Para Isaac: qué faltó o por qué dudas. Vacía si la confianza es alta." },
  },
  required: ["respuesta", "confianza", "categoria", "nota"],
  additionalProperties: false,
} as const;

function textoContexto(c: ContextoPregunta) {
  const p = c.publicacion;
  const partes: string[] = [];
  partes.push(`# Publicación ${p.itemId}\nTítulo: ${p.titulo}`);
  if (p.precio !== null) partes.push(`Precio publicado: $${p.precio.toLocaleString("es-MX")} MXN`);
  if (p.envioGratis !== null) partes.push(`Envío gratis: ${p.envioGratis ? "sí" : "no"}`);
  if (p.garantia) partes.push(`Garantía (según la publicación): ${p.garantia}`);
  if (p.variantes.length) {
    partes.push(
      "Variantes y disponibilidad en Mercado Libre:\n" +
        p.variantes
          .map((v) => `- ${v.variacion || "única"}: ${v.disponible === null ? "sin dato" : `${v.disponible} disponibles`}${v.enFull ? " (en Full, envío rápido)" : ""}`)
          .join("\n"),
    );
  }
  if (p.atributos.length) partes.push("Ficha técnica de la publicación:\n" + p.atributos.map((a) => `- ${a}`).join("\n"));
  if (p.descripcion) partes.push(`Descripción de la publicación:\n${p.descripcion.slice(0, 6000)}`);
  if (c.ficha) {
    const f = c.ficha;
    const lineas = [`# Ficha del producto en nuestro sistema\nNombre: ${f.nombre}`];
    if (f.descripcion) lineas.push(`Descripción / medidas de la pieza: ${f.descripcion}`);
    if (f.pesoKg) lineas.push(`Peso por pieza: ${f.pesoKg} kg`);
    if (f.memo) lineas.push(`Detalles del proveedor: ${f.memo}`);
    if (f.enBodega !== null) lineas.push(`Piezas en nuestra bodega (además de Full): ${f.enBodega}`);
    partes.push(lineas.join("\n"));
  }
  if (c.anterioresDelProducto.length) {
    partes.push("# Preguntas anteriores de esta publicación (ya respondidas)\n" + c.anterioresDelProducto.map((e) => `P: ${e.pregunta}\nR: ${e.respuesta}`).join("\n\n"));
  }
  if (c.correcciones.length) {
    partes.push(
      "# Así corrigió Isaac borradores anteriores (aprende de esto)\n" +
        c.correcciones.map((e) => `P: ${e.pregunta}\nBorrador: ${e.borrador}\nLo que Isaac mandó: ${e.final}`).join("\n\n"),
    );
  }
  if (c.ejemplos.length) {
    partes.push("# Otras respuestas recientes de Isaac (su tono)\n" + c.ejemplos.map((e) => `P: ${e.pregunta}\nR: ${e.respuesta}`).join("\n\n"));
  }
  partes.push(`# Pregunta a contestar (${c.fecha})\n${c.pregunta}`);
  if (c.indicacion) partes.push(`# Indicación de Isaac para esta respuesta\n${c.indicacion}`);
  return partes.join("\n\n");
}

/** Pide el borrador a Claude. Lanza un Error con un mensaje en español si
 * algo falla (sin llave, cuota, se negó…). */
export async function redactarConIa(contexto: ContextoPregunta): Promise<BorradorIa & { costoUsd: number }> {
  if (!iaConfigurada()) throw new Error("Falta la llave ANTHROPIC_API_KEY en Vercel.");
  const client = new Anthropic();
  const sistema = contexto.reglas?.trim() ? `${SISTEMA}\n\nReglas de la casa (escritas por Isaac, siempre se respetan):\n${contexto.reglas.trim()}` : SISTEMA;
  try {
    const respuesta = await client.beta.messages.create({
      model: MODELO_IA,
      max_tokens: 2500,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA } },
      system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: textoContexto(contexto) }],
    });
    const costoUsd = costoDeUso(respuesta.usage);
    if (respuesta.stop_reason === "refusal") throw new ErrorIa("La IA no quiso redactar esta respuesta: contéstala tú.", costoUsd);
    if (respuesta.stop_reason === "max_tokens") throw new ErrorIa("La IA se quedó sin espacio al redactar: vuelve a intentarlo.", costoUsd);
    const texto = respuesta.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let datos: BorradorIa;
    try {
      datos = JSON.parse(texto) as BorradorIa;
    } catch {
      throw new ErrorIa("La IA contestó en un formato raro: vuelve a intentarlo.", costoUsd);
    }
    return {
      respuesta: String(datos.respuesta ?? "").trim().slice(0, 2000),
      confianza: (["alta", "media", "baja"] as const).includes(datos.confianza) ? datos.confianza : "baja",
      categoria: (CATEGORIAS_PREGUNTA as readonly string[]).includes(datos.categoria) ? datos.categoria : "otro",
      nota: String(datos.nota ?? "").trim(),
      costoUsd,
    };
  } catch (e) {
    if (e instanceof ErrorIa) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new Error("La llave ANTHROPIC_API_KEY no es válida: revísala en Vercel.");
    if (e instanceof Anthropic.RateLimitError) throw new Error("La IA está saturada en este momento: se reintenta en unos minutos.");
    if (e instanceof Anthropic.APIError) throw new Error(`La IA respondió con error ${e.status ?? ""}: ${e.message}`.trim());
    throw e;
  }
}

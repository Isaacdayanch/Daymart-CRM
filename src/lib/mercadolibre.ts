// Jala datos públicos de Mercado Libre a partir del link de un producto —
// no necesita iniciar sesión, es la misma información que cualquiera ve en
// el anuncio. Se usa para llenar solo foto/precio/categoría/ventas al
// investigar un producto nuevo.

/** Identifica qué trae un link de Mercado Libre México:
 *  - `articulo.mercadolibre.com.mx/MLM-123...`  → una publicación (item).
 *  - `mercadolibre.com.mx/nombre/p/MLM123...`     → una página de CATÁLOGO:
 *    ese ID es del producto genérico, no de una publicación. Si el link
 *    trae `wid=MLM...` (la publicación ganadora que se estaba viendo), se
 *    usa esa; si no, hay que pedirle a la API del catálogo cuál es la
 *    publicación ganadora. */
export function identificarLinkMercadoLibre(link: string): { tipo: "item" | "producto"; id: string } | null {
  const wid = link.match(/[?&#]wid=MLM-?(\d+)/i);
  if (wid) return { tipo: "item", id: `MLM${wid[1]}` };
  const producto = link.match(/\/p\/MLM-?(\d+)/i);
  if (producto) return { tipo: "producto", id: `MLM${producto[1]}` };
  const item = link.match(/MLM-?(\d+)/i);
  return item ? { tipo: "item", id: `MLM${item[1]}` } : null;
}

/** Compatibilidad: el ID que trae el link (item o producto de catálogo). */
export function extraerItemIdMercadoLibre(link: string): string | null {
  return identificarLinkMercadoLibre(link)?.id ?? null;
}

export interface DatosMercadoLibre {
  nombre: string;
  imagenUrl: string | null;
  categoriaId: string | null;
  categoriaNombre: string | null;
  precio: number;
  ventas: number | null;
  /** gold_special = Clásica, gold_pro = Premium (tipo del anuncio de referencia). */
  tipoPublicacion: string | null;
}

interface ItemApi {
  id?: string;
  title?: string;
  price?: number;
  pictures?: { url?: string; secure_url?: string }[];
  thumbnail?: string;
  category_id?: string;
  sold_quantity?: number;
  listing_type_id?: string;
}

interface ProductoApi {
  id?: string;
  name?: string;
  pictures?: { url?: string; secure_url?: string }[];
  buy_box_winner?: { item_id?: string; price?: number; category_id?: string; listing_type_id?: string } | null;
}

const ENCABEZADOS_NAVEGADOR = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
};

async function pedirJson<T>(
  url: string,
  headers: Record<string, string>,
): Promise<{ ok: boolean; status: number; json: T | null; detalle: string }> {
  try {
    const r = await fetch(url, { headers, cache: "no-store" });
    if (r.ok) return { ok: true, status: r.status, json: (await r.json()) as T, detalle: "ok" };
    // Mercado Libre explica el rechazo en el cuerpo ("message"/"error"):
    // se guarda para poder diagnosticar sin adivinar.
    let detalle = String(r.status);
    try {
      const cuerpo = (await r.json()) as { message?: string; error?: string };
      const texto = cuerpo.message ?? cuerpo.error;
      if (texto) detalle += ` ${String(texto).slice(0, 80)}`;
    } catch {
      // sin cuerpo legible
    }
    return { ok: false, status: r.status, json: null, detalle };
  } catch (e) {
    return { ok: false, status: 0, json: null, detalle: `sin respuesta (${e instanceof Error ? e.message : "?"})` };
  }
}

/** Último recurso: leer la página pública del anuncio como la vería un
 * navegador. Las páginas de Mercado Libre traen los datos del producto en
 * un bloque estándar (JSON-LD: nombre, foto, precio) y, escondido en el
 * código, el ID de categoría. Sirve cuando la API le niega a la app ver
 * publicaciones de otros vendedores. */
async function leerPaginaPublica(
  link: string,
  intentos: string[],
): Promise<Partial<DatosMercadoLibre> | null> {
  let html: string | null = null;
  try {
    const r = await fetch(link, {
      headers: {
        "User-Agent": ENCABEZADOS_NAVEGADOR["User-Agent"],
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
      },
      cache: "no-store",
      redirect: "follow",
    });
    if (!r.ok) {
      intentos.push(`página ${link.replace(/^https?:\/\//, "").slice(0, 40)}…: ${r.status}`);
      return null;
    }
    html = await r.text();
  } catch (e) {
    intentos.push(`página: sin respuesta (${e instanceof Error ? e.message : "?"})`);
    return null;
  }
  try {
    const resultado: Partial<DatosMercadoLibre> = {};

    for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const bloque = JSON.parse(m[1]) as Record<string, unknown> | Record<string, unknown>[];
        const lista = Array.isArray(bloque) ? bloque : [bloque];
        for (const b of lista) {
          if (b["@type"] !== "Product") continue;
          if (typeof b.name === "string") resultado.nombre = b.name;
          const imagen = Array.isArray(b.image) ? b.image[0] : b.image;
          if (typeof imagen === "string") resultado.imagenUrl = imagen;
          const ofertas = b.offers as { price?: number | string } | { price?: number | string }[] | undefined;
          const oferta = Array.isArray(ofertas) ? ofertas[0] : ofertas;
          const precio = Number(oferta?.price);
          if (Number.isFinite(precio) && precio > 0) resultado.precio = precio;
        }
      } catch {
        // bloque que no es JSON válido: se ignora
      }
    }
    if (!resultado.nombre) {
      const og = html.match(/<meta property="og:title" content="([^"]+)"/i);
      if (og) resultado.nombre = og[1].replace(/\s*\|.*$/, "");
    }
    if (!resultado.imagenUrl) {
      const og = html.match(/<meta property="og:image" content="([^"]+)"/i);
      if (og) resultado.imagenUrl = og[1];
    }
    const categoria = html.match(/"category_id"\s*:\s*"(MLM\d+)"/i);
    if (categoria) resultado.categoriaId = categoria[1];
    const tipo = html.match(/"listing_type_id"\s*:\s*"(gold_[a-z_]+)"/i);
    if (tipo) resultado.tipoPublicacion = tipo[1];
    if (!resultado.nombre) intentos.push(`página: llegó pero sin datos de producto (${html.length} caracteres)`);
    return resultado.nombre ? resultado : null;
  } catch {
    intentos.push("página: no se pudo leer");
    return null;
  }
}

/** Trae lo que se pueda del anuncio, por tres caminos en orden:
 *  1. API de catálogo (`/products/{id}`) si el link es de catálogo.
 *  2. API de publicaciones (`/items/{id}`) con la cuenta conectada.
 *  3. La página pública del anuncio (JSON-LD), si la API niega el acceso.
 * Si todo falla, regresa un error claro y la pantalla deja llenar a mano. */
export async function obtenerDatosMercadoLibre(
  link: string,
): Promise<{ datos: DatosMercadoLibre | null; error: string | null }> {
  const identificado = identificarLinkMercadoLibre(link);
  if (!identificado) {
    return { datos: null, error: "No se pudo reconocer el link de Mercado Libre." };
  }

  // Con la cuenta de Isaac conectada (Módulo 5) se usa su token.
  let encabezados: Record<string, string> = ENCABEZADOS_NAVEGADOR;
  let conToken = false;
  try {
    const { obtenerAccessToken } = await import("@/lib/mercadolibre-auth");
    const token = await obtenerAccessToken();
    encabezados = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    conToken = true;
  } catch {
    // sin conexión: se sigue con la llamada pública
  }

  const parcial: Partial<DatosMercadoLibre> = {};
  const intentos: string[] = [];
  let itemId = identificado.tipo === "item" ? identificado.id : null;

  // 1) Catálogo: nombre, foto y datos de la publicación ganadora.
  if (identificado.tipo === "producto") {
    const rp = await pedirJson<ProductoApi>(`https://api.mercadolibre.com/products/${identificado.id}`, encabezados);
    if (rp.ok && rp.json) {
      parcial.nombre = rp.json.name ?? undefined;
      parcial.imagenUrl = rp.json.pictures?.[0]?.secure_url ?? rp.json.pictures?.[0]?.url ?? undefined;
      const ganador = rp.json.buy_box_winner;
      if (ganador) {
        itemId = ganador.item_id ?? null;
        if (typeof ganador.price === "number") parcial.precio = ganador.price;
        parcial.categoriaId = ganador.category_id ?? undefined;
        parcial.tipoPublicacion = ganador.listing_type_id ?? undefined;
      }
    } else {
      intentos.push(`catálogo ${identificado.id}: ${rp.detalle}`);
    }
  }

  // 2) Publicación: completa/afina lo anterior (ventas, categoría, precio).
  if (itemId) {
    const ri = await pedirJson<ItemApi>(`https://api.mercadolibre.com/items/${itemId}`, encabezados);
    if (ri.ok && ri.json) {
      const item = ri.json;
      parcial.nombre = parcial.nombre ?? item.title ?? undefined;
      parcial.imagenUrl = parcial.imagenUrl ?? item.pictures?.[0]?.secure_url ?? item.pictures?.[0]?.url ?? item.thumbnail ?? undefined;
      if (typeof item.price === "number") parcial.precio = item.price;
      parcial.categoriaId = item.category_id ?? parcial.categoriaId;
      parcial.tipoPublicacion = item.listing_type_id ?? parcial.tipoPublicacion;
      if (typeof item.sold_quantity === "number") parcial.ventas = item.sold_quantity;
    } else {
      intentos.push(`publicación ${itemId}: ${ri.detalle}`);
    }
  }

  // 3) Página pública, si todavía falta lo básico. Se prueba el link tal
  // cual y, si no, las direcciones "canónicas" de Mercado Libre.
  if (!parcial.nombre || !parcial.precio) {
    const candidatas = [link];
    if (itemId) candidatas.push(`https://articulo.mercadolibre.com.mx/${itemId.replace(/^MLM/, "MLM-")}-_JM`);
    if (identificado.tipo === "producto") candidatas.push(`https://www.mercadolibre.com.mx/p/${identificado.id}`);
    for (const url of Array.from(new Set(candidatas))) {
      const pagina = await leerPaginaPublica(url, intentos);
      if (!pagina) continue;
      parcial.nombre = parcial.nombre ?? pagina.nombre;
      parcial.imagenUrl = parcial.imagenUrl ?? pagina.imagenUrl ?? undefined;
      parcial.precio = parcial.precio ?? pagina.precio;
      parcial.categoriaId = parcial.categoriaId ?? pagina.categoriaId ?? undefined;
      parcial.tipoPublicacion = parcial.tipoPublicacion ?? pagina.tipoPublicacion ?? undefined;
      if (parcial.nombre && parcial.precio) break;
    }
  }

  if (!parcial.nombre) {
    const detalle = intentos.length ? ` Detalle: ${intentos.join(" · ")}.` : "";
    return {
      datos: null,
      error: conToken
        ? `Mercado Libre no dejó leer ese anuncio. Llena los datos a mano.${detalle}`
        : `Sin cuenta conectada, Mercado Libre bloqueó la consulta. Conecta tu cuenta en Mercado Libre → Conexión.${detalle}`,
    };
  }

  let categoriaNombre: string | null = null;
  if (parcial.categoriaId) {
    const rc = await pedirJson<{ name?: string }>(`https://api.mercadolibre.com/categories/${parcial.categoriaId}`, encabezados);
    categoriaNombre = rc.json?.name ?? null;
  }

  return {
    datos: {
      nombre: parcial.nombre,
      imagenUrl: parcial.imagenUrl ?? null,
      categoriaId: parcial.categoriaId ?? null,
      categoriaNombre,
      precio: parcial.precio ?? 0,
      ventas: parcial.ventas ?? null,
      tipoPublicacion: parcial.tipoPublicacion ?? null,
    },
    error: null,
  };
}

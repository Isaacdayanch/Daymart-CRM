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

/** Trae lo que se pueda del anuncio. Si algo falla (link raro, producto ya
 * no existe, Mercado Libre no responde), regresa un error claro en vez de
 * aventar una excepción — la pantalla deja llenar todo a mano si esto no
 * funciona. */
export async function obtenerDatosMercadoLibre(
  link: string,
): Promise<{ datos: DatosMercadoLibre | null; error: string | null }> {
  const identificado = identificarLinkMercadoLibre(link);
  if (!identificado) {
    return { datos: null, error: "No se pudo reconocer el link de Mercado Libre." };
  }

  let item: {
    title: string;
    price: number;
    pictures?: { url: string }[];
    category_id?: string;
    sold_quantity?: number;
    listing_type_id?: string;
  };
  // Mercado Libre bloquea (403) las peticiones que no traen señales de
  // navegador real — sin esto, las llamadas desde un servidor (como
  // Vercel) se ven como tráfico de robot y las rechaza.
  const encabezadosNavegador = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "application/json",
  };

  // Con la cuenta de Isaac conectada (Módulo 5) se usa su token: Mercado
  // Libre ya no bloquea la consulta. Si no hay conexión, se intenta la
  // llamada pública como antes.
  let encabezados: Record<string, string> = encabezadosNavegador;
  try {
    const { obtenerAccessToken } = await import("@/lib/mercadolibre-auth");
    const token = await obtenerAccessToken();
    encabezados = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  } catch {
    // sin conexión: se sigue con la pública
  }

  // Link de catálogo: primero se pregunta al catálogo cuál es la
  // publicación ganadora (buy_box_winner) y se sigue con esa.
  let itemId = identificado.id;
  if (identificado.tipo === "producto") {
    try {
      const rp = await fetch(`https://api.mercadolibre.com/products/${identificado.id}`, { headers: encabezados, cache: "no-store" });
      if (!rp.ok) {
        return {
          datos: null,
          error:
            rp.status === 403 || rp.status === 401
              ? "Mercado Libre bloqueó la consulta del catálogo. Conecta tu cuenta en Mercado Libre → Conexión."
              : `Mercado Libre no encontró ese producto de catálogo (${rp.status}).`,
        };
      }
      const producto = (await rp.json()) as { buy_box_winner?: { item_id?: string } | null; name?: string };
      const ganador = producto.buy_box_winner?.item_id;
      if (!ganador) {
        return {
          datos: null,
          error: `Es una página de catálogo ("${producto.name ?? identificado.id}") sin publicación ganadora. Abre una publicación concreta y pega ese link.`,
        };
      }
      itemId = ganador;
    } catch {
      return { datos: null, error: "No se pudo conectar con Mercado Libre. Llena los datos a mano." };
    }
  }

  try {
    const respuesta = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
      headers: encabezados,
      cache: "no-store",
    });
    if (!respuesta.ok) {
      return {
        datos: null,
        error:
          respuesta.status === 403 || respuesta.status === 401
            ? "Mercado Libre bloqueó la consulta. Conecta tu cuenta en Mercado Libre → Conexión y vuelve a intentar."
            : `Mercado Libre no encontró ese producto (${respuesta.status}).`,
      };
    }
    item = await respuesta.json();
  } catch {
    return { datos: null, error: "No se pudo conectar con Mercado Libre. Llena los datos a mano." };
  }

  let categoriaNombre: string | null = null;
  if (item.category_id) {
    try {
      const respuestaCategoria = await fetch(`https://api.mercadolibre.com/categories/${item.category_id}`, {
        headers: encabezados,
        cache: "no-store",
      });
      if (respuestaCategoria.ok) {
        const categoria = await respuestaCategoria.json();
        categoriaNombre = categoria?.name ?? null;
      }
    } catch {
      // Sin categoría legible no es grave — se deja en null y el nombre
      // técnico (category_id) sigue disponible para la comisión.
    }
  }

  return {
    datos: {
      nombre: item.title,
      imagenUrl: item.pictures?.[0]?.url ?? null,
      categoriaId: item.category_id ?? null,
      categoriaNombre,
      precio: item.price ?? 0,
      ventas: item.sold_quantity ?? null,
      tipoPublicacion: item.listing_type_id ?? null,
    },
    error: null,
  };
}

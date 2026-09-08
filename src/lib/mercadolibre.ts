// Jala datos públicos de Mercado Libre a partir del link de un producto —
// no necesita iniciar sesión, es la misma información que cualquiera ve en
// el anuncio. Se usa para llenar solo foto/precio/categoría/ventas al
// investigar un producto nuevo.

/** Saca el ID del producto (ej. "MLM4518836592") de cualquier link de
 * artículo de Mercado Libre México. Los links traen el patrón "MLM-123..."
 * en la ruta, con guion; la API pública lo pide sin guion. */
export function extraerItemIdMercadoLibre(link: string): string | null {
  const match = link.match(/MLM-?(\d+)/i);
  return match ? `MLM${match[1]}` : null;
}

export interface DatosMercadoLibre {
  nombre: string;
  imagenUrl: string | null;
  categoriaId: string | null;
  categoriaNombre: string | null;
  precio: number;
  ventas: number | null;
}

/** Trae lo que se pueda del anuncio. Si algo falla (link raro, producto ya
 * no existe, Mercado Libre no responde), regresa un error claro en vez de
 * aventar una excepción — la pantalla deja llenar todo a mano si esto no
 * funciona. */
export async function obtenerDatosMercadoLibre(
  link: string,
): Promise<{ datos: DatosMercadoLibre | null; error: string | null }> {
  const itemId = extraerItemIdMercadoLibre(link);
  if (!itemId) {
    return { datos: null, error: "No se pudo reconocer el link de Mercado Libre." };
  }

  let item: {
    title: string;
    price: number;
    pictures?: { url: string }[];
    category_id?: string;
    sold_quantity?: number;
  };
  // Mercado Libre bloquea (403) las peticiones que no traen señales de
  // navegador real — sin esto, las llamadas desde un servidor (como
  // Vercel) se ven como tráfico de robot y las rechaza.
  const encabezadosNavegador = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "application/json",
  };

  try {
    const respuesta = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
      headers: encabezadosNavegador,
    });
    if (!respuesta.ok) {
      return { datos: null, error: `Mercado Libre no encontró ese producto (${respuesta.status}).` };
    }
    item = await respuesta.json();
  } catch {
    return { datos: null, error: "No se pudo conectar con Mercado Libre. Llena los datos a mano." };
  }

  let categoriaNombre: string | null = null;
  if (item.category_id) {
    try {
      const respuestaCategoria = await fetch(`https://api.mercadolibre.com/categories/${item.category_id}`, {
        headers: encabezadosNavegador,
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
    },
    error: null,
  };
}

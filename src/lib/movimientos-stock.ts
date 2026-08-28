import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A veces la caché de Supabase se queda desactualizada y no reconoce una
 * columna que sí existe (error "Could not find the 'X' column ... in the
 * schema cache"). En vez de que eso tumbe el guardado del stock — que es lo
 * urgente — se reintenta sin esa columna (la base de datos usa su valor por
 * default) y se avisa cuáles quedaron pendientes de completar después.
 */
export async function insertarMovimientosStock(
  supabase: SupabaseClient,
  filas: Record<string, unknown>[],
): Promise<{ data: { id: string }[] | null; error: string | null; columnasOmitidas: string[] }> {
  let intento = filas.map((fila) => ({ ...fila }));
  const columnasOmitidas: string[] = [];

  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const { data, error } = await supabase.from("movimientos_stock").insert(intento).select("id");
    if (!error) return { data, error: null, columnasOmitidas };

    const match = error.message.match(/Could not find the '([a-zA-Z0-9_]+)' column/);
    if (!match) return { data: null, error: error.message, columnasOmitidas };

    const columna = match[1];
    columnasOmitidas.push(columna);
    intento = intento.map((fila) => {
      const copia = { ...fila };
      delete copia[columna];
      return copia;
    });
  }

  return { data: null, error: "No se pudo guardar después de varios intentos.", columnasOmitidas };
}

/** Reintenta una vez más completar las columnas que se omitieron por el
 * problema de caché, ya con el valor real — si falla, no pasa nada grave,
 * quedan con el valor por default y se pueden corregir después. */
export async function completarColumnasOmitidas(
  supabase: SupabaseClient,
  ids: string[],
  filasOriginales: Record<string, unknown>[],
  columnasOmitidas: string[],
) {
  if (!ids.length || !columnasOmitidas.length) return;
  for (let i = 0; i < ids.length; i++) {
    const actualizacion: Record<string, unknown> = {};
    for (const columna of columnasOmitidas) {
      if (columna in filasOriginales[i]) actualizacion[columna] = filasOriginales[i][columna];
    }
    if (Object.keys(actualizacion).length) {
      await supabase.from("movimientos_stock").update(actualizacion).eq("id", ids[i]);
    }
  }
}

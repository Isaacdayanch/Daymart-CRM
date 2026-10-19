// Guardar aunque falte un SQL por correr.
//
// Cada migración nueva agrega columnas, e Isaac no siempre corre el SQL en
// Supabase el mismo día que se publica el código. Hasta ahora cada acción
// traía su propio "si el error menciona peso_kg, reintenta sin peso_kg";
// esto lo generaliza: se intenta guardar la fila completa y, si Supabase se
// queja de una columna que no existe, se quita esa columna y se reintenta,
// las veces que haga falta. Lo que sí existe se guarda; lo que falta se
// pierde en silencio (igual que antes) y se devuelve en `omitidas` por si la
// pantalla quiere avisar.

/** Nombre de la columna que no existe, sacado del mensaje de PostgREST
 * ("Could not find the 'x' column of 'tabla' in the schema cache") o de
 * Postgres ('column "x" of relation "tabla" does not exist'). */
export function columnaFaltante(mensaje: string | null | undefined): string | null {
  if (!mensaje) return null;
  const m = /Could not find the '([A-Za-z0-9_]+)' column/.exec(mensaje) ?? /column "([A-Za-z0-9_]+)"/.exec(mensaje) ?? /column ([A-Za-z0-9_.]+) does not exist/.exec(mensaje);
  if (!m) return null;
  const nombre = m[1];
  return nombre.includes(".") ? nombre.split(".").pop()! : nombre;
}

/** Ejecuta `correr(fila)`; si falla por una columna inexistente, la quita y
 * reintenta. Devuelve el error final (si lo hubo) y las columnas omitidas. */
export async function sinColumnasFaltantes(
  fila: Record<string, unknown>,
  correr: (fila: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>,
  maxIntentos = 10,
): Promise<{ error: string | null; omitidas: string[] }> {
  const actual: Record<string, unknown> = { ...fila };
  const omitidas: string[] = [];
  for (let i = 0; i < maxIntentos; i++) {
    const { error } = await correr(actual);
    if (!error) return { error: null, omitidas };
    const col = columnaFaltante(error.message);
    if (!col || !(col in actual)) return { error: error.message, omitidas };
    delete actual[col];
    omitidas.push(col);
  }
  return { error: "No se pudo guardar: faltan demasiadas columnas por crear en Supabase.", omitidas };
}

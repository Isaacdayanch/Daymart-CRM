// Guardar un lote de propuestas del Director (lo comparten la puerta
// POST /api/director/propuestas y el chat del Director dentro del CRM).

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/servicio";
import { fechaTextoMx } from "@/lib/fechas-mx";
import { mensajeErrorDirector, validarPropuestasEntrantes } from "@/lib/director";
import type { PropuestaDirector } from "@/lib/tipos";

export interface LoteGuardado {
  lote: string;
  fecha: string;
  caducadas: number;
  propuestas: Pick<PropuestaDirector, "id" | "orden" | "area" | "titulo" | "estado" | "precio_propuesto">[];
}

/** Valida y guarda las propuestas con numeración corrida del día. Las
 * propuestas de días ANTERIORES que Isaac no decidió se marcan CADUCADA
 * (ya no aplican: el Director las vuelve a proponer si siguen vigentes).
 * Lanza Error con mensaje en español si algo no cuadra. */
export async function guardarPropuestas(crudo: unknown, opciones: { lote?: string | null; caducarAnteriores?: boolean; origen?: "DIRECTOR" | "CRM" } = {}): Promise<LoteGuardado> {
  const validas = validarPropuestasEntrantes(crudo);
  if ("error" in validas) throw new Error(validas.error);
  const hoy = fechaTextoMx(new Date());
  const lote = opciones.lote?.trim() ? opciones.lote.trim().slice(0, 80) : `${hoy}-${Date.now().toString(36)}`;
  const supabase = createServiceClient();

  let caducadas = 0;
  if (opciones.caducarAnteriores !== false) {
    const { data } = await supabase
      .from("director_propuestas")
      .update({ estado: "CADUCADA", resultado: "Caducó: llegó una propuesta nueva del Director." })
      .eq("estado", "PROPUESTA")
      .lt("fecha", hoy)
      .select("id");
    caducadas = data?.length ?? 0;
  }

  // Numeración corrida del día: si ya hubo un lote hoy, sigue contando.
  const { data: ultimas } = await supabase.from("director_propuestas").select("orden").eq("fecha", hoy).order("orden", { ascending: false }).limit(1);
  let orden = ultimas?.[0]?.orden ?? 0;
  const filas = validas.propuestas.map((p) => ({ ...p, fecha: hoy, lote, orden: ++orden, estado: "PROPUESTA" }));
  const { data, error } = await supabase.from("director_propuestas").insert(filas).select("*").returns<PropuestaDirector[]>();
  if (error) throw new Error(mensajeErrorDirector(error));

  await supabase.from("director_bitacora").insert({
    origen: opciones.origen ?? "DIRECTOR",
    accion: "PROPUESTAS",
    detalle: { lote, cantidad: data?.length ?? 0, caducadas, areas: Array.from(new Set(filas.map((f) => f.area))) },
  });
  revalidatePath("/director");
  revalidatePath("/");
  return {
    lote,
    fecha: hoy,
    caducadas,
    propuestas: (data ?? []).map((p) => ({ id: p.id, orden: p.orden, area: p.area, titulo: p.titulo, estado: p.estado, precio_propuesto: p.precio_propuesto })),
  };
}

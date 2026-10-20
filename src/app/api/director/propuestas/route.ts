import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/servicio";
import { fechaTextoMx } from "@/lib/fechas-mx";
import { mensajeErrorDirector, validarPropuestasEntrantes } from "@/lib/director";
import type { PropuestaDirector } from "@/lib/tipos";
import { anotarBitacora, autorizadoDirector, leerJson, noAutorizado } from "../_comun";

export const dynamic = "force-dynamic";

/** El Director mete sus propuestas del día. Cuerpo:
 * `{ lote?: string, propuestas: [{ area, titulo, detalle?, porque?, datos?,
 *    accion_tipo?, item_id?, sku_crm?, imagen_url?, precio_propuesto? }],
 *    caducar_anteriores?: boolean (true por defecto) }`.
 * Las propuestas de días ANTERIORES que Isaac no decidió se marcan CADUCADA
 * (ya no aplican: el Director las vuelve a proponer si siguen vigentes).
 * Devuelve cada propuesta con su id y su número, y el link de la pantalla. */
export async function POST(request: NextRequest) {
  if (!autorizadoDirector(request)) return noAutorizado();
  const cuerpo = await leerJson(request);
  if (!cuerpo) return NextResponse.json({ error: "El cuerpo debe ser JSON con «propuestas»." }, { status: 400 });
  const validas = validarPropuestasEntrantes(cuerpo.propuestas);
  if ("error" in validas) return NextResponse.json({ error: validas.error }, { status: 400 });

  const hoy = fechaTextoMx(new Date());
  const lote = typeof cuerpo.lote === "string" && cuerpo.lote.trim() ? cuerpo.lote.trim().slice(0, 80) : `${hoy}-${Date.now().toString(36)}`;
  const caducar = cuerpo.caducar_anteriores !== false;
  const supabase = createServiceClient();

  try {
    let caducadas = 0;
    if (caducar) {
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

    await anotarBitacora({ origen: "DIRECTOR", accion: "PROPUESTAS", detalle: { lote, cantidad: data?.length ?? 0, caducadas, areas: Array.from(new Set(filas.map((f) => f.area))) } });
    revalidatePath("/director");
    revalidatePath("/");
    return NextResponse.json({
      ok: true,
      lote,
      fecha: hoy,
      caducadas,
      pantalla: "https://daymart-crm.vercel.app/director",
      propuestas: (data ?? []).map((p) => ({ id: p.id, orden: p.orden, area: p.area, titulo: p.titulo, estado: p.estado })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudieron guardar las propuestas." }, { status: 500 });
  }
}

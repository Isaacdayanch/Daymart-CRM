import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ejecutarAprobadas } from "@/lib/director-ejecutar";
import { autorizadoDirector, leerJson, noAutorizado } from "../_comun";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Ejecuta en Mercado Libre las propuestas APROBADAS con acción automática
 * que sigan sin ejecutar (red de seguridad: normalmente se ejecutan en
 * cuanto Isaac aprueba). Cuerpo opcional: `{ ids: [...] }`. Lo llama el
 * Director o el reloj. */
export async function POST(request: NextRequest) {
  if (!autorizadoDirector(request)) return noAutorizado();
  const cuerpo = await leerJson(request);
  const ids = cuerpo && Array.isArray(cuerpo.ids) ? (cuerpo.ids as unknown[]).filter((x): x is string => typeof x === "string") : undefined;
  try {
    const resultados = await ejecutarAprobadas({ ids });
    revalidatePath("/director");
    revalidatePath("/mercadolibre/promociones");
    return NextResponse.json({ ok: true, ejecutadas: resultados.filter((r) => r.ok).length, fallidas: resultados.filter((r) => !r.ok).length, resultados });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudieron ejecutar." }, { status: 500 });
  }
}

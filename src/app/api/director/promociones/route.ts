import { NextRequest, NextResponse } from "next/server";
import { promocionesDeItem } from "@/lib/mercadolibre-promociones";
import { autorizadoDirector, noAutorizado } from "../_comun";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Promociones que Mercado Libre ofrece (candidatas: relámpago, campañas)
 * y las ya activas, por publicación. `?items=MLM1,MLM2` (máx. 15 por
 * llamada: es una consulta a ML por publicación). El Director las usa para
 * proponer `PARTICIPAR_PROMOCION` con el `promotion_id`/`promotion_type`
 * exactos y el precio sugerido por ML. */
export async function GET(request: NextRequest) {
  if (!autorizadoDirector(request)) return noAutorizado();
  const items = (request.nextUrl.searchParams.get("items") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^MLM\d{6,}$/.test(s));
  if (!items.length) return NextResponse.json({ error: "Manda ?items=MLM123,MLM456 (números de publicación)." }, { status: 400 });
  const resultado: Record<string, unknown> = {};
  for (const itemId of items.slice(0, 15)) {
    try {
      const lista = await promocionesDeItem(itemId);
      resultado[itemId] = lista.map((p) => ({
        promotion_id: p.id,
        promotion_type: p.tipo,
        nombre: p.nombre,
        estado: p.estado,
        inicio: p.inicio,
        fin: p.fin,
        limite_para_aceptar: p.limite,
        precio_promo: p.precioPromo,
        precio_original: p.precioOriginal,
        precio_sugerido: p.precioSugerido,
        precio_min: p.precioMin,
        precio_max: p.precioMax,
        pone_ml_pct: p.meliPct,
        pone_vendedor_pct: p.sellerPct,
      }));
    } catch (e) {
      resultado[itemId] = { error: e instanceof Error ? e.message : "No se pudo consultar." };
    }
  }
  return NextResponse.json({ ok: true, ignorados: items.length > 15 ? items.slice(15) : [], promociones: resultado });
}

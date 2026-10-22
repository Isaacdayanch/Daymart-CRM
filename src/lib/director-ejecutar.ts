// Director de Mercado Libre — fase 2: el CRM EJECUTA en Mercado Libre lo que
// Isaac aprobó. Solo las propuestas con `accion_tipo` automático; las
// MANUAL las hace Isaac y las marca "Ya la hice". Todo queda en
// `director_bitacora` (origen CRM) y en la bitácora de promociones.
//
// Regla de Isaac (25 sep): el precio base de una publicación NUNCA se toca;
// un precio más bajo siempre entra como promoción (se puede quitar).

import { createServiceClient } from "@/lib/supabase/servicio";
import { ACCIONES_DIRECTOR, mensajeErrorDirector, resumenPropuesta } from "@/lib/director";
import type { PropuestaDirector } from "@/lib/tipos";

export interface ResultadoEjecucion {
  id: string;
  orden: number;
  titulo: string;
  ok: boolean;
  /** true = no era automática (MANUAL): no se tocó. */
  manual?: boolean;
  resultado?: string;
  error?: string;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function numero(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Precio que de verdad se aplica: el que Isaac escribió al aprobar, si no
 * el propuesto, si no el que venga en `datos.precio`. */
export function precioAEjecutar(p: Pick<PropuestaDirector, "precio_aprobado" | "precio_propuesto" | "datos">) {
  return p.precio_aprobado ?? p.precio_propuesto ?? numero(p.datos?.precio);
}

/** Candado: el Director puede mandar `datos.precio_minimo` (el precio por
 * debajo del cual ya no se cumple el margen mínimo). Si Isaac bajó el precio
 * más allá, no se aplica y se le dice por qué. */
function revisarPrecioMinimo(p: PropuestaDirector, precio: number | null): string | null {
  const minimo = numero(p.datos?.precio_minimo);
  if (precio !== null && minimo !== null && precio < minimo) {
    return `No se aplicó: $${precio.toLocaleString("es-MX")} queda abajo del precio mínimo con margen ($${minimo.toLocaleString("es-MX")}). Regresa la propuesta y apruébala con otro precio.`;
  }
  return null;
}

/** Ejecuta UNA propuesta en Mercado Libre según su `accion_tipo`. No toca la
 * base del Director (eso lo hace `ejecutarAprobadas`). */
export async function ejecutarEnMercadoLibre(p: PropuestaDirector): Promise<{ ok: boolean; manual?: boolean; resultado?: string; error?: string }> {
  const accion = ACCIONES_DIRECTOR[p.accion_tipo];
  if (!accion || !accion.automatica) return { ok: false, manual: true };
  const datos = p.datos ?? {};
  const itemId = texto(datos.item_id) ?? p.item_id;
  const titulo = texto(datos.titulo) ?? p.titulo;
  const { aplicarPromocion, quitarPromocion, isoFechaMx } = await import("@/lib/mercadolibre-promociones");

  if (p.accion_tipo === "PROMOCION_DESCUENTO") {
    if (!itemId) return { ok: false, error: "Falta item_id (la publicación) en la propuesta." };
    const precio = precioAEjecutar(p);
    if (!precio || precio <= 0) return { ok: false, error: "Falta el precio con descuento." };
    const candado = revisarPrecioMinimo(p, precio);
    if (candado) return { ok: false, error: candado };
    const precioBase = numero(datos.precio_base);
    if (precioBase && precio >= precioBase) return { ok: false, error: `El precio ($${precio.toLocaleString("es-MX")}) no es menor que el precio base ($${precioBase.toLocaleString("es-MX")}): una promoción solo puede bajar.` };
    const fin = texto(datos.fin);
    const r = await aplicarPromocion({ itemId, titulo, tipo: "PRICE_DISCOUNT", precioPromo: precio, precioBase, fin: fin ? isoFechaMx(fin, true) : null, modo: "DIRECTOR", margenEstimadoPct: numero(datos.margen_pct) });
    return r.ok ? { ok: true, resultado: `Descuento del vendedor aplicado: $${precio.toLocaleString("es-MX")}${fin ? ` hasta ${fin}` : ""}.` } : { ok: false, error: r.error ?? "Mercado Libre no aceptó la promoción." };
  }

  if (p.accion_tipo === "PARTICIPAR_PROMOCION") {
    if (!itemId) return { ok: false, error: "Falta item_id (la publicación) en la propuesta." };
    const tipo = texto(datos.promotion_type);
    if (!tipo) return { ok: false, error: "Falta promotion_type (LIGHTNING, DEAL, …) en la propuesta." };
    const promocionId = texto(datos.promotion_id);
    const precio = precioAEjecutar(p);
    const candado = revisarPrecioMinimo(p, precio);
    if (candado) return { ok: false, error: candado };
    const r = await aplicarPromocion({ itemId, titulo, tipo, promocionId, precioPromo: precio, precioBase: numero(datos.precio_base), modo: "DIRECTOR", margenEstimadoPct: numero(datos.margen_pct) });
    return r.ok ? { ok: true, resultado: `Participando en ${tipo}${promocionId ? ` (${promocionId})` : ""}${precio ? ` a $${precio.toLocaleString("es-MX")}` : ""}.` } : { ok: false, error: r.error ?? "Mercado Libre no aceptó la participación." };
  }

  if (p.accion_tipo === "QUITAR_PROMOCION") {
    if (!itemId) return { ok: false, error: "Falta item_id (la publicación) en la propuesta." };
    const tipo = texto(datos.promotion_type) ?? "PRICE_DISCOUNT";
    const r = await quitarPromocion({ itemId, titulo, tipo, promocionId: texto(datos.promotion_id), precioBase: numero(datos.precio_base) });
    return r.ok ? { ok: true, resultado: `Promoción ${tipo} quitada; el precio base queda igual.` } : { ok: false, error: r.error ?? "Mercado Libre no dejó quitar la promoción." };
  }

  // ADS, PUBLICACION, RESPONDER_PREGUNTA: fases 3 y 4.
  return { ok: false, error: `El CRM todavía no sabe ejecutar "${accion.etiqueta}" (llega en una fase siguiente). Hazla a mano y márcala hecha.` };
}

/** Ejecuta las propuestas APROBADAS con acción automática (todas, o solo las
 * de `ids`). Cada una pasa a EJECUTADA o FALLIDA con su resultado/error y
 * deja rastro en la bitácora con origen CRM. Las MANUAL no se tocan. */
export async function ejecutarAprobadas(opciones: { ids?: string[]; limite?: number } = {}): Promise<ResultadoEjecucion[]> {
  const supabase = createServiceClient();
  let consulta = supabase.from("director_propuestas").select("*").eq("estado", "APROBADA").order("fecha").order("orden").limit(opciones.limite ?? 15);
  if (opciones.ids?.length) consulta = consulta.in("id", opciones.ids);
  const { data, error } = await consulta.returns<PropuestaDirector[]>();
  if (error) throw new Error(mensajeErrorDirector(error));
  const resultados: ResultadoEjecucion[] = [];
  for (const p of data ?? []) {
    if (!ACCIONES_DIRECTOR[p.accion_tipo]?.automatica) continue;
    let r: Awaited<ReturnType<typeof ejecutarEnMercadoLibre>>;
    try {
      r = await ejecutarEnMercadoLibre(p);
    } catch (e) {
      r = { ok: false, error: e instanceof Error ? e.message : "Error al ejecutar." };
    }
    if (r.manual) continue;
    const ahora = new Date().toISOString();
    await supabase
      .from("director_propuestas")
      .update(r.ok ? { estado: "EJECUTADA", ejecutado_en: ahora, resultado: r.resultado ?? "Hecha por el CRM.", error: null } : { estado: "FALLIDA", ejecutado_en: ahora, error: r.error ?? "Falló.", resultado: null })
      .eq("id", p.id)
      .eq("estado", "APROBADA");
    await supabase.from("director_bitacora").insert({
      origen: "CRM",
      accion: r.ok ? "EJECUTADA" : "FALLO_AL_EJECUTAR",
      propuesta_id: p.id,
      detalle: { accion_tipo: p.accion_tipo, item_id: p.item_id, precio: precioAEjecutar(p) },
      resultado: r.ok ? `${resumenPropuesta(p)} — ${r.resultado}` : resumenPropuesta(p),
      error: r.ok ? null : (r.error ?? null),
    });
    resultados.push({ id: p.id, orden: p.orden, titulo: p.titulo, ok: r.ok, resultado: r.resultado, error: r.error });
  }
  return resultados;
}

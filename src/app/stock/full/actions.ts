"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { texto } from "@/lib/form-helpers";
import { obtenerPerfilActual } from "@/lib/perfil";

async function conSesion() {
  const perfil = await obtenerPerfilActual();
  return Boolean(perfil);
}

function refrescar() {
  revalidatePath("/stock");
  revalidatePath("/stock/full");
  revalidatePath("/stock/movimientos");
  revalidatePath("/mercadolibre/stock");
  revalidatePath("/");
}

interface LineaEnvio {
  sku: string;
  nombre: string;
  cantidad: number;
  piezasPorCaja: number;
  imagenUrl: string | null;
}

/** Isaac arma un envío a Full: queda "Preparado" y se ve como "en camino a
 * Full"; la bodega se descuenta hasta que Mercado Libre confirma. */
export async function crearEnvioFull(formData: FormData) {
  if (!(await conSesion())) return { error: "Inicia sesión." };
  const supabase = await createClient();
  const bodegaId = texto(formData, "bodega_id");
  const color = texto(formData, "color_etiqueta");
  const notas = texto(formData, "notas");
  const fechaCampo = texto(formData, "fecha");
  const fecha = fechaCampo ? new Date(`${fechaCampo}T12:00:00`).toISOString() : new Date().toISOString();
  let lineas: LineaEnvio[];
  try {
    lineas = JSON.parse((formData.get("lineas") as string) || "[]");
  } catch {
    return { error: "No se pudieron leer las líneas." };
  }
  if (!lineas.length) return { error: "Agrega al menos un producto." };
  if (lineas.some((l) => !l.sku || !(l.cantidad > 0))) return { error: "Revisa las cantidades." };

  const { data: envio, error } = await supabase
    .from("envios_full")
    .insert({ bodega_id: bodegaId, color_etiqueta: color, notas, fecha })
    .select("id")
    .single<{ id: string }>();
  if (error || !envio) return { error: error?.message ?? "No se pudo crear el envío." };
  const { error: errorLineas } = await supabase.from("envios_full_lineas").insert(
    lineas.map((l) => ({
      envio_id: envio.id,
      sku: l.sku,
      nombre: l.nombre,
      imagen_url: l.imagenUrl,
      piezas_por_caja: l.piezasPorCaja || 1,
      cantidad_enviada: l.cantidad,
    })),
  );
  if (errorLineas) {
    await supabase.from("envios_full").delete().eq("id", envio.id);
    return { error: errorLineas.message };
  }
  refrescar();
  return { error: null };
}

/** Cancelar un envío preparado (nunca salió): no toca el stock. */
export async function cancelarEnvioFull(envioId: string) {
  if (!(await conSesion())) return { error: "Inicia sesión." };
  const supabase = await createClient();
  const { data: conSalidas } = await supabase.from("movimientos_stock").select("id").eq("envio_full_id", envioId).limit(1);
  if (conSalidas?.length) return { error: "Este envío ya tiene salidas confirmadas; no se puede cancelar." };
  const { error } = await supabase.from("envios_full").update({ estado: "CANCELADO", cerrado_en: new Date().toISOString() }).eq("id", envioId).eq("estado", "PREPARADO");
  if (error) return { error: error.message };
  refrescar();
  return { error: null };
}

export async function atenderRecepcion(recepcionId: string, formData: FormData) {
  if (!(await conSesion())) return { error: "Inicia sesión." };
  const { atenderRecepcionFull } = await import("@/lib/salidas-ml");
  const decision = texto(formData, "decision") === "IGNORADA" ? "IGNORADA" : "SALIDA";
  const cantidadCampo = Number(formData.get("cantidad"));
  const r = await atenderRecepcionFull(recepcionId, {
    decision,
    sku: texto(formData, "sku"),
    cantidad: Number.isFinite(cantidadCampo) && cantidadCampo > 0 ? cantidadCampo : undefined,
    envioId: texto(formData, "envio_id"),
  });
  if (!r.error) refrescar();
  return r;
}

export async function resolverDiferencia(lineaId: string, decision: "QUEDO_EN_BODEGA" | "MERMA") {
  if (!(await conSesion())) return { error: "Inicia sesión." };
  const { resolverDiferenciaLinea } = await import("@/lib/salidas-ml");
  const r = await resolverDiferenciaLinea(lineaId, decision);
  if (!r.error) refrescar();
  return r;
}

export async function confirmarDevolucion(ordenId: number, decision: "REINGRESADA" | "MERMA") {
  if (!(await conSesion())) return { error: "Inicia sesión." };
  const { confirmarDevolucionMl } = await import("@/lib/salidas-ml");
  const r = await confirmarDevolucionMl(ordenId, decision);
  if (!r.error) refrescar();
  return r;
}

/** Interruptor de salidas automáticas por ventas de ML (con fecha de arranque). */
export async function configurarSalidasMl(formData: FormData) {
  if (!(await conSesion())) return { error: "Inicia sesión." };
  const supabase = await createClient();
  const apagar = formData.get("apagar") === "true";
  const desde = texto(formData, "desde");
  if (!apagar && !desde) return { error: "Elige la fecha de arranque." };
  const { error } = await supabase.from("configuracion_stock").update({ salidas_ml_desde: apagar ? null : desde }).eq("id", 1);
  if (error) return { error: error.message };
  if (!apagar) {
    const { procesarVentasMl } = await import("@/lib/salidas-ml");
    await procesarVentasMl();
  }
  refrescar();
  return { error: null };
}

export async function procesarAhora() {
  if (!(await conSesion())) return { error: "Inicia sesión.", generadas: 0 };
  const { procesarVentasMl, registrarHistorialFull } = await import("@/lib/salidas-ml");
  try {
    await registrarHistorialFull();
    const r = await procesarVentasMl();
    refrescar();
    return { error: null, generadas: r.generadas };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo procesar.", generadas: 0 };
  }
}

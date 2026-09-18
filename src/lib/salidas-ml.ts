// Salidas de stock ligadas a Mercado Libre. Regla de oro: nada sale de
// bodega sin motivo registrado, y cada salida automática queda ligada a su
// origen (orden de ML, envío a Full, recepción detectada) para que nunca se
// duplique. Todo corre con la service role (lo llama el reloj y las
// pantallas del servidor).

import { createServiceClient } from "@/lib/supabase/servicio";
import { insertarMovimientosStock } from "@/lib/movimientos-stock";
import { costoPromedioPonderado } from "@/lib/calculos-stock";
import { claveVinculo, obtenerPublicaciones, obtenerVinculos, skuCrmDe, type PublicacionMl } from "@/lib/mercadolibre-stock";
import type { OrdenItemMl, OrdenMl } from "@/lib/mercadolibre-ordenes";
import type { Bodega, EnvioFull, EnvioFullLinea, MovimientoStock, RecepcionFull } from "@/lib/tipos";

/** Estados de envío en que la mercancía YA salió físicamente de la bodega. */
const ENVIO_SALIO = new Set(["shipped", "delivered", "not_delivered"]);
/** Logísticas que salen de la bodega de Isaac (todo lo que no es Full). */
export const LOGISTICAS_BODEGA = new Set(["Colecta", "Punto de envío", "Colecta en agencia", "Flex", "Acordado"]);

async function bodegaPrincipal(): Promise<Bodega | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("bodegas").select("*").is("eliminado_en", null).order("creado_en").limit(1).maybeSingle<Bodega>();
  return data ?? null;
}

/** Liga publicación → SKU del CRM (manual o automática por SKU igual). */
async function resolvedorSku() {
  const supabase = createServiceClient();
  const [publicaciones, vinculos, { data: skus }] = await Promise.all([
    obtenerPublicaciones(),
    obtenerVinculos(),
    supabase.from("movimientos_stock").select("sku").returns<{ sku: string }[]>(),
  ]);
  const mapaVinculos = new Map(vinculos.map((v) => [claveVinculo(v.item_id, v.variation_id), v.sku_crm]));
  const skusCrm = new Set((skus ?? []).map((s) => s.sku));
  const porClave = new Map(publicaciones.map((p) => [claveVinculo(p.item_id, p.variation_id), p]));
  return {
    publicaciones,
    skuDe(itemId: string | null, variationId: number | null, sellerSku: string | null): string | null {
      if (!itemId) return null;
      const manual = mapaVinculos.get(claveVinculo(itemId, variationId)) ?? (variationId !== null ? mapaVinculos.get(claveVinculo(itemId, null)) : undefined);
      if (manual) return manual;
      const pub = porClave.get(claveVinculo(itemId, variationId));
      if (pub) {
        const r = skuCrmDe(pub, mapaVinculos, skusCrm);
        if (r.sku) return r.sku;
      }
      if (sellerSku && skusCrm.has(sellerSku)) return sellerSku;
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// 1) Detección de recepciones en Full (el total del inventario sube)
// ---------------------------------------------------------------------------

/** Se llama al terminar cada sincronización de publicaciones: guarda el
 * total en Full de cada inventario si cambió y, si SUBIÓ, crea una
 * "recepción detectada" para que Isaac decida si salió de su bodega. La
 * primera vez que se ve un inventario solo se toma como base (no se
 * inventa una recepción). */
export async function registrarHistorialFull(publicaciones?: PublicacionMl[]) {
  const supabase = createServiceClient();
  const pubs = publicaciones ?? (await obtenerPublicaciones());
  const porInventario = new Map<string, PublicacionMl>();
  for (const p of pubs) {
    if (!p.inventory_id || p.full_disponible === null) continue;
    // La tradicional manda sobre la de catálogo para el título/SKU.
    const actual = porInventario.get(p.inventory_id);
    if (!actual || (actual.catalogo && !p.catalogo)) porInventario.set(p.inventory_id, p);
  }
  if (porInventario.size === 0) return { nuevas: 0 };

  const ids = Array.from(porInventario.keys());
  const { data: ultimas } = await supabase
    .from("mercadolibre_full_historial")
    .select("inventory_id, total, disponible, sincronizado_en")
    .in("inventory_id", ids)
    .order("sincronizado_en", { ascending: false })
    .returns<{ inventory_id: string; total: number; disponible: number; sincronizado_en: string }[]>();
  const ultimaPor = new Map<string, { total: number; disponible: number }>();
  for (const u of ultimas ?? []) if (!ultimaPor.has(u.inventory_id)) ultimaPor.set(u.inventory_id, u);

  const { skuDe } = await resolvedorSku();
  const ahora = new Date().toISOString();
  const historial: Record<string, unknown>[] = [];
  const recepciones: Record<string, unknown>[] = [];
  for (const [inventoryId, p] of porInventario) {
    const total = (p.full_disponible ?? 0) + (p.full_no_disponible ?? 0);
    const disponible = p.full_disponible ?? 0;
    const previa = ultimaPor.get(inventoryId);
    if (previa && previa.total === total && previa.disponible === disponible) continue;
    historial.push({ inventory_id: inventoryId, sincronizado_en: ahora, total, disponible });
    if (previa && total > previa.total) {
      recepciones.push({
        inventory_id: inventoryId,
        item_id: p.item_id,
        variation_id: p.variation_id,
        titulo: [p.titulo, p.variacion].filter(Boolean).join(" · "),
        sku_crm: skuDe(p.item_id, p.variation_id, p.seller_sku),
        cantidad: total - previa.total,
        total_antes: previa.total,
        total_despues: total,
        detectado_en: ahora,
      });
    }
  }
  if (historial.length) await supabase.from("mercadolibre_full_historial").insert(historial);
  if (recepciones.length) await supabase.from("mercadolibre_full_recepciones").insert(recepciones);
  return { nuevas: recepciones.length };
}

export async function obtenerRecepcionesPendientes(): Promise<RecepcionFull[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("mercadolibre_full_recepciones")
    .select("*")
    .is("atendido_en", null)
    .order("detectado_en", { ascending: false })
    .returns<RecepcionFull[]>();
  return data ?? [];
}

/** Isaac decide qué hacer con una recepción detectada. `SALIDA` = sí salió
 * de la bodega: se crea la salida (ligada a la recepción y, si aplica, al
 * envío a Full preparado) y se avanza la línea del envío. */
export async function atenderRecepcionFull(
  recepcionId: string,
  opciones: { decision: "SALIDA" | "IGNORADA"; sku?: string | null; cantidad?: number; envioId?: string | null; bodegaId?: string | null },
) {
  const supabase = createServiceClient();
  const { data: recepcion } = await supabase.from("mercadolibre_full_recepciones").select("*").eq("id", recepcionId).maybeSingle<RecepcionFull>();
  if (!recepcion) return { error: "No se encontró la recepción." };
  if (recepcion.atendido_en) return { error: "Esta recepción ya se atendió." };

  if (opciones.decision === "IGNORADA") {
    await supabase.from("mercadolibre_full_recepciones").update({ atendido_en: new Date().toISOString(), decision: "IGNORADA" }).eq("id", recepcionId);
    return { error: null };
  }

  const sku = opciones.sku ?? recepcion.sku_crm;
  if (!sku) return { error: "Liga primero esta publicación con un producto del CRM." };
  const cantidad = opciones.cantidad ?? recepcion.cantidad;
  if (!Number.isFinite(cantidad) || cantidad <= 0) return { error: "La cantidad no es válida." };

  const bodega = opciones.bodegaId ? { id: opciones.bodegaId } : await bodegaPrincipal();
  if (!bodega) return { error: "No hay ninguna bodega dada de alta." };

  // Datos del producto (nombre/foto/piezas por caja) desde su último movimiento.
  const { data: ultimo } = await supabase
    .from("movimientos_stock")
    .select("*")
    .eq("sku", sku)
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle<MovimientoStock>();

  // Envío a Full preparado que trae este SKU (el más viejo primero).
  let envioId = opciones.envioId ?? null;
  let linea: EnvioFullLinea | null = null;
  if (envioId !== "NINGUNO") {
    let consulta = supabase
      .from("envios_full_lineas")
      .select("*, envios_full!inner(estado, fecha)")
      .eq("sku", sku)
      .eq("resuelta", false)
      .eq("envios_full.estado", "PREPARADO");
    if (envioId) consulta = consulta.eq("envio_id", envioId);
    const { data: lineas } = await consulta.returns<(EnvioFullLinea & { envios_full: { estado: string; fecha: string } })[]>();
    const candidata = (lineas ?? []).sort((a, b) => a.envios_full.fecha.localeCompare(b.envios_full.fecha))[0];
    if (candidata) {
      linea = candidata;
      envioId = candidata.envio_id;
    } else if (!envioId) {
      envioId = null;
    }
  } else {
    envioId = null;
  }

  const { data: insertados, error } = await insertarMovimientosStock(supabase, [
    {
      tipo: "SALIDA",
      sku,
      nombre: ultimo?.nombre ?? recepcion.titulo ?? sku,
      bodega_id: bodega.id,
      cantidad,
      piezas_por_caja: ultimo?.piezas_por_caja ?? 1,
      imagen_url: ultimo?.imagen_url ?? null,
      costo_unitario_pesos: 0,
      destino: "Full",
      referencia: `Recibido en Full por Mercado Libre${envioId ? " · envío preparado" : ""}`,
      envio_full_id: envioId,
      recepcion_full_id: recepcionId,
      creado_en: recepcion.detectado_en,
    },
  ]);
  if (error) return { error };
  const movimientoId = insertados?.[0]?.id ?? null;

  await supabase
    .from("mercadolibre_full_recepciones")
    .update({ atendido_en: new Date().toISOString(), decision: "SALIDA", envio_id: envioId, movimiento_stock_id: movimientoId, sku_crm: sku })
    .eq("id", recepcionId);

  if (linea) {
    const recibida = linea.cantidad_recibida + cantidad;
    const resuelta = recibida + linea.merma >= linea.cantidad_enviada;
    await supabase.from("envios_full_lineas").update({ cantidad_recibida: recibida, resuelta }).eq("id", linea.id);
    await cerrarEnvioSiTermino(linea.envio_id);
  }
  return { error: null };
}

async function cerrarEnvioSiTermino(envioId: string) {
  const supabase = createServiceClient();
  const { data: pendientes } = await supabase.from("envios_full_lineas").select("id").eq("envio_id", envioId).eq("resuelta", false).limit(1);
  if (!pendientes?.length) {
    await supabase.from("envios_full").update({ estado: "RECIBIDO", cerrado_en: new Date().toISOString() }).eq("id", envioId).eq("estado", "PREPARADO");
  }
}

/** Diferencia en una línea de envío (ML recibió menos): "QUEDO_EN_BODEGA"
 * = nunca se fue, se ajusta lo enviado; "MERMA" = se perdió/dañó, sale de
 * bodega como merma. */
export async function resolverDiferenciaLinea(lineaId: string, decision: "QUEDO_EN_BODEGA" | "MERMA", bodegaId?: string | null) {
  const supabase = createServiceClient();
  const { data: linea } = await supabase.from("envios_full_lineas").select("*").eq("id", lineaId).maybeSingle<EnvioFullLinea>();
  if (!linea) return { error: "No se encontró la línea." };
  const faltante = linea.cantidad_enviada - linea.cantidad_recibida - linea.merma;
  if (faltante <= 0) return { error: "Esta línea ya está completa." };

  if (decision === "QUEDO_EN_BODEGA") {
    await supabase.from("envios_full_lineas").update({ cantidad_enviada: linea.cantidad_recibida + linea.merma || linea.cantidad_enviada, resuelta: true }).eq("id", lineaId);
  } else {
    const bodega = bodegaId ? { id: bodegaId } : await bodegaPrincipal();
    if (!bodega) return { error: "No hay ninguna bodega dada de alta." };
    const { error } = await insertarMovimientosStock(supabase, [
      {
        tipo: "SALIDA",
        sku: linea.sku,
        nombre: linea.nombre,
        bodega_id: bodega.id,
        cantidad: faltante,
        piezas_por_caja: linea.piezas_por_caja,
        imagen_url: linea.imagen_url,
        costo_unitario_pesos: 0,
        destino: "Merma",
        referencia: `No llegó a Full (envío preparado)`,
        envio_full_id: linea.envio_id,
        creado_en: new Date().toISOString(),
      },
    ]);
    if (error) return { error };
    await supabase.from("envios_full_lineas").update({ merma: linea.merma + faltante, resuelta: true }).eq("id", lineaId);
  }
  await cerrarEnvioSiTermino(linea.envio_id);
  return { error: null };
}

// ---------------------------------------------------------------------------
// 2) Ventas de ML que salen de la bodega (Colecta, Flex, Punto de envío…)
// ---------------------------------------------------------------------------

export interface VentaSinSalida {
  orden: OrdenMl;
  items: OrdenItemMl[];
  /** Items que no se pudieron ligar a un SKU del CRM. */
  sinLigar: OrdenItemMl[];
}

async function ordenesCandidatas(desde: string) {
  const supabase = createServiceClient();
  const { data: ordenes } = await supabase
    .from("mercadolibre_ordenes")
    .select("*")
    .eq("estado", "paid")
    .is("salida_generada_en", null)
    .gte("fecha_creacion", `${desde}T00:00:00-06:00`)
    .returns<OrdenMl[]>();
  const lista = (ordenes ?? []).filter((o) => o.logistica && LOGISTICAS_BODEGA.has(o.logistica) && o.envio_estado && ENVIO_SALIO.has(o.envio_estado));
  if (!lista.length) return { ordenes: [] as OrdenMl[], itemsPorOrden: new Map<number, OrdenItemMl[]>() };
  const { data: items } = await supabase
    .from("mercadolibre_orden_items")
    .select("*")
    .in("orden_id", lista.map((o) => o.id))
    .returns<OrdenItemMl[]>();
  const itemsPorOrden = new Map<number, OrdenItemMl[]>();
  for (const it of items ?? []) itemsPorOrden.set(it.orden_id, [...(itemsPorOrden.get(it.orden_id) ?? []), it]);
  return { ordenes: lista, itemsPorOrden };
}

/** Genera las salidas de las ventas de ML que ya salieron de la bodega y
 * todavía no tienen salida. Las órdenes con algún producto sin ligar se
 * quedan pendientes (no se pierden: aparecen en "por ligar"). Devuelve
 * cuántas se generaron y cuáles quedaron pendientes. */
export async function procesarVentasMl(): Promise<{ generadas: number; pendientes: VentaSinSalida[]; desde: string | null; devolucionesNuevas: number }> {
  const supabase = createServiceClient();
  const { data: config } = await supabase.from("configuracion_stock").select("salidas_ml_desde").eq("id", 1).maybeSingle<{ salidas_ml_desde: string | null }>();
  const desde = config?.salidas_ml_desde ?? null;
  if (!desde) return { generadas: 0, pendientes: [], desde: null, devolucionesNuevas: 0 };

  const bodega = await bodegaPrincipal();
  if (!bodega) return { generadas: 0, pendientes: [], desde, devolucionesNuevas: 0 };

  const { ordenes, itemsPorOrden } = await ordenesCandidatas(desde);
  const { skuDe } = await resolvedorSku();

  // Nombre/foto/piezas por caja de cada SKU (de su último movimiento).
  const skusNecesarios = new Set<string>();
  const planes: { orden: OrdenMl; lineas: { sku: string; item: OrdenItemMl }[] }[] = [];
  const pendientes: VentaSinSalida[] = [];
  for (const orden of ordenes) {
    const items = itemsPorOrden.get(orden.id) ?? [];
    if (!items.length) continue;
    const lineas: { sku: string; item: OrdenItemMl }[] = [];
    const sinLigar: OrdenItemMl[] = [];
    for (const it of items) {
      const sku = skuDe(it.item_id, it.variation_id, it.seller_sku);
      if (sku) lineas.push({ sku, item: it });
      else sinLigar.push(it);
    }
    if (sinLigar.length) pendientes.push({ orden, items, sinLigar });
    else {
      planes.push({ orden, lineas });
      for (const l of lineas) skusNecesarios.add(l.sku);
    }
  }

  const datosSku = new Map<string, MovimientoStock>();
  if (skusNecesarios.size) {
    const { data: movs } = await supabase
      .from("movimientos_stock")
      .select("*")
      .in("sku", Array.from(skusNecesarios))
      .order("creado_en", { ascending: false })
      .returns<MovimientoStock[]>();
    for (const m of movs ?? []) if (!datosSku.has(m.sku)) datosSku.set(m.sku, m);
  }

  let generadas = 0;
  for (const plan of planes) {
    const filas = plan.lineas.map(({ sku, item }) => {
      const d = datosSku.get(sku);
      return {
        tipo: "SALIDA",
        sku,
        nombre: d?.nombre ?? item.titulo ?? sku,
        bodega_id: bodega.id,
        cantidad: item.cantidad,
        piezas_por_caja: d?.piezas_por_caja ?? 1,
        imagen_url: d?.imagen_url ?? item.imagen_url ?? null,
        costo_unitario_pesos: 0,
        destino: "Mercado Libre",
        referencia: `Venta ML #${plan.orden.id} · ${plan.orden.logistica}`,
        orden_ml_id: plan.orden.id,
        creado_en: plan.orden.fecha_creacion,
      };
    });
    // Se marca ANTES de insertar para que dos relojes al mismo tiempo no
    // dupliquen; si el insert falla, se desmarca.
    const { data: marcada } = await supabase
      .from("mercadolibre_ordenes")
      .update({ salida_generada_en: new Date().toISOString() })
      .eq("id", plan.orden.id)
      .is("salida_generada_en", null)
      .select("id");
    if (!marcada?.length) continue;
    const { error } = await insertarMovimientosStock(supabase, filas);
    if (error) {
      await supabase.from("mercadolibre_ordenes").update({ salida_generada_en: null }).eq("id", plan.orden.id);
      continue;
    }
    generadas += 1;
  }

  // Devoluciones: la venta ya tenía salida y ML la canceló después.
  const { data: canceladas } = await supabase
    .from("mercadolibre_ordenes")
    .update({ devolucion_estado: "POR_CONFIRMAR" })
    .eq("estado", "cancelled")
    .not("salida_generada_en", "is", null)
    .is("devolucion_estado", null)
    .select("id");

  return { generadas, pendientes, desde, devolucionesNuevas: canceladas?.length ?? 0 };
}

/** Solo lectura: las ventas que están esperando liga (para la pantalla). */
export async function ventasPendientesPorLigar(): Promise<VentaSinSalida[]> {
  const supabase = createServiceClient();
  const { data: config } = await supabase.from("configuracion_stock").select("salidas_ml_desde").eq("id", 1).maybeSingle<{ salidas_ml_desde: string | null }>();
  if (!config?.salidas_ml_desde) return [];
  const { ordenes, itemsPorOrden } = await ordenesCandidatas(config.salidas_ml_desde);
  const { skuDe } = await resolvedorSku();
  const pendientes: VentaSinSalida[] = [];
  for (const orden of ordenes) {
    const items = itemsPorOrden.get(orden.id) ?? [];
    const sinLigar = items.filter((it) => !skuDe(it.item_id, it.variation_id, it.seller_sku));
    if (sinLigar.length) pendientes.push({ orden, items, sinLigar });
  }
  return pendientes;
}

export async function devolucionesPorConfirmar(): Promise<{ orden: OrdenMl; items: OrdenItemMl[] }[]> {
  const supabase = createServiceClient();
  const { data: ordenes } = await supabase
    .from("mercadolibre_ordenes")
    .select("*")
    .eq("devolucion_estado", "POR_CONFIRMAR")
    .order("fecha_creacion", { ascending: false })
    .returns<OrdenMl[]>();
  if (!ordenes?.length) return [];
  const { data: items } = await supabase.from("mercadolibre_orden_items").select("*").in("orden_id", ordenes.map((o) => o.id)).returns<OrdenItemMl[]>();
  return ordenes.map((orden) => ({ orden, items: (items ?? []).filter((i) => i.orden_id === orden.id) }));
}

/** La venta cancelada regresó (REINGRESADA: se suma de vuelta al stock con
 * su costo promedio) o no regresó / llegó dañada (MERMA: se queda fuera). */
export async function confirmarDevolucionMl(ordenId: number, decision: "REINGRESADA" | "MERMA") {
  const supabase = createServiceClient();
  const { data: orden } = await supabase.from("mercadolibre_ordenes").select("*").eq("id", ordenId).maybeSingle<OrdenMl>();
  if (!orden || orden.devolucion_estado !== "POR_CONFIRMAR") return { error: "Esta devolución ya se atendió." };

  if (decision === "REINGRESADA") {
    const { data: salidas } = await supabase.from("movimientos_stock").select("*").eq("orden_ml_id", ordenId).eq("tipo", "SALIDA").returns<MovimientoStock[]>();
    if (!salidas?.length) return { error: "No se encontró la salida original de esta venta." };
    const skus = Array.from(new Set(salidas.map((s) => s.sku)));
    const { data: movs } = await supabase.from("movimientos_stock").select("*").in("sku", skus).returns<MovimientoStock[]>();
    const filas = salidas.map((s) => ({
      tipo: "AJUSTE",
      sku: s.sku,
      nombre: s.nombre,
      bodega_id: s.bodega_id,
      cantidad: s.cantidad,
      piezas_por_caja: s.piezas_por_caja,
      imagen_url: s.imagen_url,
      costo_unitario_pesos: costoPromedioPonderado((movs ?? []).filter((m) => m.sku === s.sku)),
      destino: "Devolución",
      referencia: `Devolución de venta ML #${ordenId}`,
      orden_ml_id: ordenId,
      creado_en: new Date().toISOString(),
    }));
    const { error } = await insertarMovimientosStock(supabase, filas);
    if (error) return { error };
  }
  await supabase.from("mercadolibre_ordenes").update({ devolucion_estado: decision }).eq("id", ordenId);
  return { error: null };
}

// ---------------------------------------------------------------------------
// 3) Envíos a Full (preparados por Isaac)
// ---------------------------------------------------------------------------

export async function obtenerEnviosFull(): Promise<{ envio: EnvioFull; lineas: EnvioFullLinea[] }[]> {
  const supabase = createServiceClient();
  const [{ data: envios }, { data: lineas }] = await Promise.all([
    supabase.from("envios_full").select("*").neq("estado", "CANCELADO").order("fecha", { ascending: false }).limit(60).returns<EnvioFull[]>(),
    supabase.from("envios_full_lineas").select("*").order("creado_en").returns<EnvioFullLinea[]>(),
  ]);
  return (envios ?? []).map((envio) => ({ envio, lineas: (lineas ?? []).filter((l) => l.envio_id === envio.id) }));
}

/** Piezas por SKU que están "en camino a Full" (preparadas, no confirmadas). */
export function enCaminoAFullPorSku(envios: { envio: EnvioFull; lineas: EnvioFullLinea[] }[]) {
  const porSku = new Map<string, number>();
  for (const { envio, lineas } of envios) {
    if (envio.estado !== "PREPARADO") continue;
    for (const l of lineas) {
      if (l.resuelta) continue;
      const faltante = l.cantidad_enviada - l.cantidad_recibida - l.merma;
      if (faltante > 0) porSku.set(l.sku, (porSku.get(l.sku) ?? 0) + faltante);
    }
  }
  return porSku;
}

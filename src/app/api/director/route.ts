import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/servicio";
import { obtenerConexion } from "@/lib/mercadolibre-auth";
import { claveLigaSku, claveVinculo, factoresVinculos, normalizarSellerSku, obtenerIgnorados, obtenerPublicaciones, obtenerVinculos, resumenFull, skuCrmDe, type PublicacionMl, type VinculoMl } from "@/lib/mercadolibre-stock";
import { agruparPorCodigoMl, esCodigoPendiente } from "@/lib/mercadolibre-codigos";
import { envioPromedioPorItem, obtenerBitacoraPromociones, obtenerMargenMinimo, piezasVendidasPorItem, preguntasSinResponder } from "@/lib/mercadolibre-promociones";
import { margenPublicacion } from "@/lib/mercadolibre-margen";
import { itemsDeOrdenes, type OrdenItemMl, type OrdenMl } from "@/lib/mercadolibre-ordenes";
import { comisionOrden, netoOrden, totalVendidoOrden } from "@/lib/mercadolibre-montos";
import { analisisVentasMl } from "@/lib/mercadolibre-analisis";
import { resumenPorSku } from "@/lib/calculos-stock";
import { obtenerPiezasPorCajaPorSku } from "@/lib/productos-stock";
import { llegadasProximas } from "@/lib/avisos-contenedores";
import { saldoFactura } from "@/lib/calculos-facturas";
import { cargosPorVencer } from "@/lib/calculos-socios-deuda";
import { fechaTextoMx, inicioDelDiaMx, ZONA_MX } from "@/lib/fechas-mx";
import { ESTADOS_CONTENEDOR, type ConfiguracionStock, type Contenedor, type FacturaPendiente, type MovimientoDeudaProveedor, type MovimientoStock, type PagoFactura, type PropuestaDirector } from "@/lib/tipos";
import { mensajeErrorDirector } from "@/lib/director";
import { autorizadoDirector, noAutorizado } from "./_comun";

/** Puerta de SOLO LECTURA para el "Director" (el agente que cada mañana
 * revisa la cuenta de Mercado Libre y le propone a Isaac qué hacer).
 *
 * Mismo patrón que `/api/respaldo`: quien llama es un programa, no un
 * navegador con sesión, así que la única puerta es la clave secreta
 * `DIRECTOR_SECRET` (variable de entorno en Vercel). Usa la service role
 * key del lado del servidor y NUNCA debe reutilizarse para nada que el
 * navegador toque. No escribe nada: el Director propone, Isaac decide.
 *
 * Devuelve en un solo JSON lo que el Director necesita para su rutina:
 * ventas de ayer y de 7 días, stock en bodega y en Full, qué se acaba y
 * cuánto pedir (Análisis de venta), margen por publicación, promociones
 * vigentes, SKUs sin ligar, preguntas sin responder, contenedores por
 * llegar y vencimientos de Finanzas. Cada bloque va en try/catch: si uno
 * falla, los demás llegan igual y el error se reporta en `errores`. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DIA_MS = 86400000;

function redondear(n: number) {
  return Math.round(n * 100) / 100;
}

/** Totales de un grupo de órdenes pagadas, con las mismas reglas que la pantalla de Ventas. */
function totalesOrdenes(ordenes: OrdenMl[], items: OrdenItemMl[]) {
  const piezasPorOrden = new Map<number, number>();
  for (const it of items) piezasPorOrden.set(it.orden_id, (piezasPorOrden.get(it.orden_id) ?? 0) + it.cantidad);
  let vendido = 0;
  let comisiones = 0;
  let envios = 0;
  let neto = 0;
  let piezas = 0;
  for (const o of ordenes) {
    vendido += totalVendidoOrden(o);
    comisiones += comisionOrden(o);
    envios += o.costo_envio_vendedor ?? 0;
    neto += netoOrden(o);
    piezas += piezasPorOrden.get(o.id) ?? 0;
  }
  return { ventas: ordenes.length, piezas, vendido: redondear(vendido), comisiones: redondear(comisiones), envios: redondear(envios), te_queda: redondear(neto) };
}

export async function GET(request: NextRequest) {
  if (!autorizadoDirector(request)) return noAutorizado();

  const ahora = new Date();
  const hoyTexto = fechaTextoMx(ahora);
  const inicioHoy = inicioDelDiaMx(ahora);
  const inicioAyer = new Date(inicioHoy.getTime() - DIA_MS);
  const hace7 = new Date(inicioHoy.getTime() - 7 * DIA_MS);
  const hace30 = new Date(ahora.getTime() - 30 * DIA_MS);
  const errores: Record<string, string> = {};
  const salida: Record<string, unknown> = {
    generado_en: ahora.toISOString(),
    hoy: hoyTexto,
    dia_semana: new Intl.DateTimeFormat("es-MX", { timeZone: ZONA_MX, weekday: "long" }).format(ahora),
    crm: "https://daymart-crm.vercel.app",
  };

  const supabase = createServiceClient();

  // ---- Stock del CRM (bodega) -------------------------------------------
  const [{ data: movimientos, error: errorMovs }, { data: configuracion }, piezasPorCajaPorSku] = await Promise.all([
    supabase.from("movimientos_stock").select("*").returns<MovimientoStock[]>(),
    supabase.from("configuracion_stock").select("*").single<ConfiguracionStock>(),
    obtenerPiezasPorCajaPorSku(supabase),
  ]);
  if (errorMovs) errores.stock = errorMovs.message;
  const diasEspera = configuracion?.dias_espera ?? 60;
  const resumenes = resumenPorSku(movimientos ?? [], diasEspera, piezasPorCajaPorSku);
  const skusCrm = new Set(resumenes.map((r) => r.sku));
  const costoPorSku = new Map(resumenes.map((r) => [r.sku, r.costoPromedio]));
  const nombrePorSku = new Map(resumenes.map((r) => [r.sku, r.nombre]));

  // ---- Mercado Libre: publicaciones, ligas, Full -------------------------
  let publicaciones: PublicacionMl[] = [];
  let vinculosLista: VinculoMl[] = [];
  let vinculos = new Map<string, string>();
  let factores = new Map<string, number>();
  let ignorados = new Set<string>();
  try {
    const [pubs, vins, ign] = await Promise.all([obtenerPublicaciones(), obtenerVinculos(), obtenerIgnorados().catch(() => [])]);
    publicaciones = pubs;
    vinculosLista = vins;
    vinculos = new Map(vins.map((v) => [claveVinculo(v.item_id, v.variation_id), v.sku_crm]));
    factores = factoresVinculos(vins);
    ignorados = new Set(ign.map((i) => i.clave));
  } catch (e) {
    errores.publicaciones = e instanceof Error ? e.message : "No se pudieron leer las publicaciones.";
  }
  const full = resumenFull(publicaciones, vinculos, skusCrm, costoPorSku, factores);
  const activas = publicaciones.filter((p) => p.estado === "active");

  salida.stock = {
    dias_espera: diasEspera,
    valor_bodega: redondear(resumenes.reduce((s, r) => s + r.valorInventario, 0)),
    valor_full: redondear(full.valor),
    piezas_full: full.piezas,
    inventarios_full_sin_ligar: full.inventariosSinLigar,
    productos: resumenes
      .filter((r) => r.stockActual > 0 || (full.porSku.get(r.sku) ?? 0) > 0)
      .map((r) => ({
        sku: r.sku,
        nombre: r.nombre,
        bodega: r.stockActual,
        full: full.porSku.get(r.sku) ?? 0,
        costo_promedio: redondear(r.costoPromedio),
        rotacion_diaria_bodega: redondear(r.rotacionDiaria),
        reordenar: r.necesitaReorden,
      })),
  };

  // ---- Ventas de ML: ayer y 7 días ---------------------------------------
  let ordenes30: OrdenMl[] = [];
  let items30: OrdenItemMl[] = [];
  try {
    const { data, error } = await supabase
      .from("mercadolibre_ordenes")
      .select("id, pack_id, estado, fecha_creacion, total, comision, costo_envio_vendedor, pagado_comprador, envio_comprador, logistica")
      .eq("estado", "paid")
      .gte("fecha_creacion", hace30.toISOString())
      .limit(5000)
      .returns<OrdenMl[]>();
    if (error) throw new Error(error.message);
    ordenes30 = data ?? [];
    if (ordenes30.length) items30 = await itemsDeOrdenes(ordenes30.map((o) => o.id), "orden_id, item_id, variation_id, titulo, cantidad, precio_unitario");
    const enRango = (desde: Date, hasta: Date) => ordenes30.filter((o) => new Date(o.fecha_creacion) >= desde && new Date(o.fecha_creacion) < hasta);
    const ayer = enRango(inicioAyer, inicioHoy);
    const semana = enRango(hace7, inicioHoy);
    const idsAyer = new Set(ayer.map((o) => o.id));
    const idsSemana = new Set(semana.map((o) => o.id));
    const porItem = new Map<string, { titulo: string | null; piezas: number; facturado: number }>();
    for (const it of items30.filter((i) => idsSemana.has(i.orden_id))) {
      const k = `${it.item_id}|${it.variation_id ?? 0}`;
      const g = porItem.get(k) ?? { titulo: it.titulo, piezas: 0, facturado: 0 };
      g.piezas += it.cantidad;
      g.facturado += it.cantidad * it.precio_unitario;
      porItem.set(k, g);
    }
    salida.ventas_ml = {
      ayer: totalesOrdenes(ayer, items30.filter((i) => idsAyer.has(i.orden_id))),
      ultimos_7_dias: totalesOrdenes(semana, items30.filter((i) => idsSemana.has(i.orden_id))),
      ultimos_30_dias: totalesOrdenes(ordenes30, items30),
      top_7_dias: Array.from(porItem.entries())
        .map(([k, g]) => ({ item_id: k.split("|")[0], titulo: g.titulo, piezas: g.piezas, facturado: redondear(g.facturado) }))
        .sort((a, b) => b.facturado - a.facturado)
        .slice(0, 15),
    };
  } catch (e) {
    errores.ventas_ml = e instanceof Error ? e.message : "No se pudieron leer las ventas.";
  }

  // ---- Publicaciones: margen, Full por acabarse, sin ventas ---------------
  let margenMinimo = 20;
  try {
    margenMinimo = await obtenerMargenMinimo();
    const vendidas30 = piezasVendidasPorItem(ordenes30, items30, 30);
    const vendidas14 = piezasVendidasPorItem(ordenes30, items30, 14);
    const envioPorItem = envioPromedioPorItem(ordenes30, items30, 30);
    const vistosFull = new Set<string>();
    const lista = activas.map((p) => {
      const { sku, origen } = skuCrmDe(p, vinculos, skusCrm);
      const costo = sku ? (costoPorSku.get(sku) ?? null) : null;
      const envio = envioPorItem.get(p.item_id) ?? null;
      const margen =
        sku && p.comision_pct !== null && p.comision_pct !== undefined && p.precio
          ? margenPublicacion({ precio: p.precio, comisionPct: p.comision_pct, comisionFija: p.comision_fija ?? 0, envio: envio ?? 0, costo: costo ?? 0 })
          : null;
      const rotacion = (vendidas30.get(p.item_id) ?? 0) / 30;
      const esFull = p.logistica === "Full" && p.inventory_id && p.full_disponible !== null;
      const inventarioRepetido = esFull && vistosFull.has(p.inventory_id!);
      if (esFull) vistosFull.add(p.inventory_id!);
      const diasFull = esFull && rotacion > 0 ? (p.full_disponible ?? 0) / rotacion : null;
      return {
        item_id: p.item_id,
        variation_id: p.variation_id,
        titulo: p.titulo,
        variacion: p.variacion,
        seller_sku: p.seller_sku,
        catalogo: p.catalogo,
        logistica: p.logistica,
        tipo_publicacion: p.tipo_publicacion ?? null,
        precio: p.precio,
        precio_base: p.precio_original ?? p.precio,
        en_promocion: Boolean(p.precio_original && p.precio && p.precio_original > p.precio),
        comision_pct: p.comision_pct ?? null,
        comision_fija: p.comision_fija ?? null,
        envio_promedio: envio === null ? null : redondear(envio),
        sku_crm: sku,
        nombre_crm: sku ? (nombrePorSku.get(sku) ?? null) : null,
        origen_liga: origen,
        costo: costo === null ? null : redondear(costo),
        te_queda: margen ? margen.queda : null,
        margen_pct: margen ? redondear(margen.pct) : null,
        abajo_del_margen_minimo: margen ? margen.pct < margenMinimo : null,
        full_disponible: p.full_disponible,
        full_no_disponible: p.full_no_disponible,
        inventory_id: p.inventory_id,
        inventario_compartido: inventarioRepetido,
        cantidad_publicada: p.cantidad_publicada,
        vendidas_30_dias: vendidas30.get(p.item_id) ?? 0,
        vendidas_14_dias: vendidas14.get(p.item_id) ?? 0,
        dias_de_full: diasFull === null ? null : Math.floor(diasFull),
        en_bodega: sku ? (resumenes.find((r) => r.sku === sku)?.stockActual ?? 0) : null,
      };
    });
    salida.publicaciones = {
      margen_minimo_pct: margenMinimo,
      activas: lista.length,
      pausadas_o_finalizadas: publicaciones.length - activas.length,
      sin_comision_sincronizada: lista.filter((p) => p.comision_pct === null).length,
      lista,
    };
  } catch (e) {
    errores.margen = e instanceof Error ? e.message : "No se pudo calcular el margen.";
  }

  // ---- Análisis de venta (qué se acaba, cuánto pedir) ---------------------
  try {
    const analisis = await analisisVentasMl(supabase, hace30, ahora);
    salida.analisis_30_dias = {
      dias_espera: analisis.diasEspera,
      primera_foto: analisis.primeraFoto,
      falta_sql: analisis.faltaSql,
      filas: analisis.filas
        .filter((f) => f.piezasVendidas > 0 || f.stockHoy > 0)
        .map((f) => ({
          titulo: f.titulo,
          variacion: f.variacion,
          sku_crm: f.sku,
          item_ids: f.itemIds,
          dias_disponible: redondear(f.diasDisponible),
          dias_sin_stock: redondear(f.diasSinStock),
          vendidas: f.piezasVendidas,
          ventas_por_dia: f.ventasPorDia === null ? null : redondear(f.ventasPorDia),
          proyeccion_30: f.proyeccion30 === null ? null : Math.round(f.proyeccion30),
          bodega: f.stockBodega,
          full: f.stockFull,
          stock_hoy: f.stockHoy,
          dias_alcanza: f.diasAlcanza === null ? null : Math.floor(f.diasAlcanza),
          sugerido_pedir: f.sugeridoPedir,
          se_acaba_antes_del_pedido: f.diasAlcanza !== null && f.diasAlcanza < analisis.diasEspera,
        }))
        .sort((a, b) => (a.dias_alcanza ?? 99999) - (b.dias_alcanza ?? 99999)),
    };
  } catch (e) {
    errores.analisis = e instanceof Error ? e.message : "No se pudo correr el análisis de venta.";
  }

  // ---- Promociones vigentes (bitácora del CRM) ----------------------------
  try {
    const cambios = await obtenerBitacoraPromociones(60);
    salida.promociones_crm = cambios
      .filter((c) => !c.deshecho_en && c.resultado === "ok" && (c.accion ?? "APLICAR") === "APLICAR")
      .map((c) => ({ id: c.id, item_id: c.item_id, titulo: c.titulo, precio_base: c.precio_anterior, precio_promo: c.precio_nuevo, margen_estimado_pct: c.margen_estimado_pct, tipo: c.promocion_tipo, fin: c.fin_promocion, desde: c.creado_en }));
  } catch (e) {
    errores.promociones = e instanceof Error ? e.message : "No se pudo leer la bitácora de promociones.";
  }

  // ---- Sin ligar (misma regla que el aviso ámbar `AvisoSkusPendientes`) ---
  // En Full manda el Código ML (un código = un producto del CRM); fuera de
  // Full, por SKU de ML o por publicación.
  try {
    const codigosPendientes = agruparPorCodigoMl(publicaciones, vinculosLista, resumenes.map((r) => ({ sku: r.sku, nombre: r.nombre })), skusCrm, ignorados)
      .filter(esCodigoPendiente)
      .map((g) => ({ codigo_ml: g.inventoryId, titulo: g.titulo, seller_sku: g.sellerSku, en_full: g.enFull, estado: g.estado, sugerencia: g.sugerencia ? `${g.sugerencia.nombre} (${g.sugerencia.sku})` : null }));
    const porSku = new Map<string, { sinResolver: boolean; activa: boolean; titulo: string | null }>();
    const sinSku: { item_id: string; titulo: string | null }[] = [];
    for (const p of publicaciones.filter((x) => !x.inventory_id)) {
      const resuelve = Boolean(skuCrmDe(p, vinculos, skusCrm).sku);
      const k = normalizarSellerSku(p.seller_sku);
      if (!k) {
        if (!resuelve && p.estado === "active" && !ignorados.has(claveVinculo(p.item_id, p.variation_id))) sinSku.push({ item_id: p.item_id, titulo: p.titulo });
        continue;
      }
      const g = porSku.get(k) ?? { sinResolver: false, activa: false, titulo: p.titulo };
      if (!resuelve) g.sinResolver = true;
      if (p.estado === "active") g.activa = true;
      porSku.set(k, g);
    }
    const pendientes = Array.from(porSku.entries())
      .filter(([k, g]) => g.sinResolver && g.activa && !ignorados.has(claveLigaSku(k)))
      .map(([k, g]) => ({ seller_sku: k, titulo: g.titulo }));
    salida.ligas_pendientes = {
      codigos_ml_full: codigosPendientes,
      skus_ml_fuera_de_full: pendientes,
      publicaciones_sin_sku_fuera_de_full: sinSku,
      total: codigosPendientes.length + pendientes.length + sinSku.length,
      ligar_en: "https://daymart-crm.vercel.app/mercadolibre/skus",
    };
  } catch (e) {
    errores.ligas = e instanceof Error ? e.message : "No se pudieron revisar las ligas.";
  }

  // ---- Preguntas sin responder (una llamada a ML, tope 4 s) --------------
  try {
    const conexion = await obtenerConexion();
    salida.mercadolibre_conectado = Boolean(conexion);
    if (conexion) {
      salida.preguntas_sin_responder = await Promise.race([preguntasSinResponder(conexion.ml_user_id), new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
    }
  } catch (e) {
    errores.preguntas = e instanceof Error ? e.message : "No se pudieron leer las preguntas.";
  }

  // ---- Contenedores --------------------------------------------------------
  try {
    const { data: contenedores, error } = await supabase.from("contenedores").select("*").is("eliminado_en", null).order("numero", { ascending: false }).returns<Contenedor[]>();
    if (error) throw new Error(error.message);
    const etiqueta = (estado: string) => ESTADOS_CONTENEDOR.find((e) => e.valor === estado)?.etiqueta ?? estado;
    const lista = contenedores ?? [];
    const vivos = lista.filter((c) => c.estado !== "RECIBIDO_BODEGA");
    const ids = vivos.map((c) => c.id);
    const { data: productos } = ids.length
      ? await supabase.from("productos").select("contenedor_id, sku, nombre, cantidad").in("contenedor_id", ids).returns<{ contenedor_id: string; sku: string; nombre: string; cantidad: number }[]>()
      : { data: [] as { contenedor_id: string; sku: string; nombre: string; cantidad: number }[] };
    salida.contenedores = {
      por_llegar: llegadasProximas(lista, hoyTexto, 14).map((l) => ({ numero: l.contenedor.numero, estado: etiqueta(l.contenedor.estado), llega: l.contenedor.fecha_estimada_llegada, dias: l.dias, vencida: l.vencida })),
      vivos: vivos.map((c) => ({
        numero: c.numero,
        estado: etiqueta(c.estado),
        fabrica: c.fabrica_principal,
        llega_aprox: c.fecha_estimada_llegada ?? null,
        productos: (productos ?? []).filter((p) => p.contenedor_id === c.id).map((p) => ({ sku: p.sku, nombre: p.nombre, cantidad: p.cantidad })),
      })),
    };
  } catch (e) {
    errores.contenedores = e instanceof Error ? e.message : "No se pudieron leer los contenedores.";
  }

  // ---- Finanzas: lo que vence en 7 días -----------------------------------
  try {
    const [{ data: facturas }, { data: pagos }, { data: deuda }] = await Promise.all([
      supabase.from("facturas_pendientes").select("*").eq("pagada", false).returns<FacturaPendiente[]>(),
      supabase.from("pagos_factura").select("*").returns<PagoFactura[]>(),
      supabase.from("movimientos_deuda_proveedor").select("*").returns<MovimientoDeudaProveedor[]>(),
    ]);
    const limite = ahora.getTime() + 7 * DIA_MS;
    const facturasPorVencer = (facturas ?? [])
      .map((f) => ({ f, ...saldoFactura(f, pagos ?? []) }))
      .filter((x) => x.saldo > 0.01 && x.f.fecha_limite && new Date(x.f.fecha_limite).getTime() <= limite)
      .map((x) => ({ proveedor: x.f.proveedor, folio: x.f.folio, saldo: redondear(x.saldo), moneda: x.f.moneda, vence: x.f.fecha_limite, vencida: new Date(x.f.fecha_limite!).getTime() < ahora.getTime() }));
    const cargos = cargosPorVencer(deuda ?? [], 7, ahora.getTime()).map((c) => ({ proveedor: c.cargo.proveedor, pendiente: redondear(c.pendiente), moneda: c.cargo.moneda, vence: c.cargo.fecha_limite, vencido: c.vencido }));
    salida.finanzas = { facturas_por_vencer: facturasPorVencer, cargos_proveedor_por_vencer: cargos };
  } catch (e) {
    errores.finanzas = e instanceof Error ? e.message : "No se pudieron leer los vencimientos.";
  }

  // ---- Propuestas del Director (migración 0058) --------------------------
  // Lo que Isaac ya decidió y el Director todavía no le ha reportado, lo que
  // sigue esperando decisión, y lo decidido en los últimos 7 días (para no
  // volver a proponer lo que ya rechazó).
  try {
    const hace7Iso = hace7.toISOString();
    const [{ data: pendientes, error: e1 }, { data: decididas, error: e2 }] = await Promise.all([
      supabase.from("director_propuestas").select("*").eq("estado", "PROPUESTA").order("fecha", { ascending: false }).order("orden").returns<PropuestaDirector[]>(),
      supabase.from("director_propuestas").select("*").neq("estado", "PROPUESTA").gte("creado_en", hace7Iso).order("decidido_en", { ascending: false }).returns<PropuestaDirector[]>(),
    ]);
    if (e1) throw new Error(mensajeErrorDirector(e1));
    if (e2) throw new Error(mensajeErrorDirector(e2));
    const compacta = (p: PropuestaDirector) => ({
      id: p.id,
      fecha: p.fecha,
      orden: p.orden,
      area: p.area,
      titulo: p.titulo,
      accion_tipo: p.accion_tipo,
      item_id: p.item_id,
      sku_crm: p.sku_crm,
      precio_propuesto: p.precio_propuesto,
      estado: p.estado,
      precio_aprobado: p.precio_aprobado,
      nota_isaac: p.nota_isaac,
      decidido_en: p.decidido_en,
      decidido_desde: p.decidido_desde,
      ejecutado_en: p.ejecutado_en,
      resultado: p.resultado,
      error: p.error,
      datos: p.datos,
    });
    salida.propuestas = {
      pantalla: "https://daymart-crm.vercel.app/director",
      pendientes: (pendientes ?? []).map(compacta),
      decididas_sin_reportar: (decididas ?? []).filter((p) => !p.reportada_en).map(compacta),
      decididas_7_dias: (decididas ?? []).map(compacta),
    };
  } catch (e) {
    errores.propuestas = e instanceof Error ? e.message : "No se pudieron leer las propuestas.";
  }

  // ---- Órdenes de Isaac por WhatsApp (migración 0059) --------------------
  try {
    const { data, error } = await supabase.from("director_mensajes").select("id, creado_en, texto, tipo, atendido_en").eq("direccion", "ENTRADA").eq("tipo", "ORDEN").is("atendido_en", null).order("creado_en").limit(50);
    if (error) throw new Error(mensajeErrorDirector(error));
    salida.mensajes_de_isaac = { ordenes_sin_atender: data ?? [], whatsapp_configurado: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_ISAAC) };
  } catch (e) {
    errores.mensajes = e instanceof Error ? e.message : "No se pudieron leer los mensajes de WhatsApp.";
  }

  salida.errores = errores;
  return NextResponse.json(salida);
}

// Análisis de venta de Mercado Libre (migración 0046).
//
// Idea de Isaac (6 oct): "si de un producto vendí 1,000 piezas en un mes
// pero solo estuvo activo 1 día, en realidad vende 1,000 por día". Por eso
// aquí las ventas se dividen entre los DÍAS DISPONIBLE (activa Y con stock),
// no entre los días del calendario. Con eso sale la proyección a 30 días,
// cuánto alcanza el stock de hoy y cuánto pedir para cubrir el tiempo de
// espera de un pedido nuevo (Stock → Configuración).
//
// Los días disponible salen de los tramos que guarda la sincronización de
// publicaciones (`mercadolibre_publicaciones_historial`). Antes de la
// primera foto no sabemos si estaba activa: ahí se aproxima con "días que
// tuvieron al menos una venta" y se marca como aproximado.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "./supabase/servicio";
import { claveVinculo, factorDePublicacion, factoresVinculos, obtenerPublicaciones, obtenerVinculos, resumenFull, skuCrmDe, type PublicacionMl } from "./mercadolibre-stock";
import { itemsDeOrdenes, type OrdenItemMl } from "./mercadolibre-ordenes";
import { resumenPorSku } from "./calculos-stock";
import { obtenerPiezasPorCajaPorSku } from "./productos-stock";
import { fechaTextoMx, inicioDelDiaMx } from "./fechas-mx";
import type { ConfiguracionStock, MovimientoStock } from "./tipos";

const DIA_MS = 86400000;

interface Tramo {
  item_id: string;
  variation_id: number | null;
  inventory_id: string | null;
  activa: boolean;
  con_stock: boolean;
  desde: string;
  hasta: string;
}

type Intervalo = [number, number];

export interface DiaAnalisis {
  dia: string;
  /** 0..1: fracción del día en que estuvo disponible (activa y con stock). */
  disponible: number;
  /** 0..1: fracción del día activa pero SIN stock. */
  sinStock: number;
  /** true si ese día no hay fotos (antes del historial). */
  sinDatos: boolean;
  ventas: number;
}

export interface FilaAnalisis {
  clave: string;
  titulo: string;
  variacion: string | null;
  imagenUrl: string | null;
  sku: string | null;
  itemIds: string[];
  diasPeriodo: number;
  diasDisponible: number;
  diasSinStock: number;
  /** Días del periodo sin ninguna foto (antes del historial). */
  diasSinDatos: number;
  /** Días sin fotos que tuvieron ventas y se contaron como disponibles (aprox.). */
  diasAproximados: number;
  piezasVendidas: number;
  ventasPorDia: number | null;
  proyeccion30: number | null;
  stockBodega: number;
  stockFull: number;
  stockHoy: number;
  diasAlcanza: number | null;
  sugeridoPedir: number;
  diario: DiaAnalisis[];
}

export interface ResultadoAnalisis {
  filas: FilaAnalisis[];
  diasEspera: number;
  desde: string;
  hasta: string;
  /** Primera foto guardada en todo el sistema (null = SQL sin correr o sin fotos). */
  primeraFoto: string | null;
  faltaSql: boolean;
}

function unir(intervalos: Intervalo[]): Intervalo[] {
  const orden = [...intervalos].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Intervalo[] = [];
  for (const [a, b] of orden) {
    const ultimo = out[out.length - 1];
    if (ultimo && a <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], b);
    else out.push([a, b]);
  }
  return out;
}

function restar(base: Intervalo[], quitar: Intervalo[]): Intervalo[] {
  let actual = base;
  for (const [qa, qb] of quitar) {
    const siguiente: Intervalo[] = [];
    for (const [a, b] of actual) {
      if (qb <= a || qa >= b) siguiente.push([a, b]);
      else {
        if (qa > a) siguiente.push([a, qa]);
        if (qb < b) siguiente.push([qb, b]);
      }
    }
    actual = siguiente;
  }
  return actual;
}

function horasEnDia(intervalos: Intervalo[], diaInicio: number, diaFin: number) {
  let ms = 0;
  for (const [a, b] of intervalos) {
    const x = Math.max(a, diaInicio);
    const y = Math.min(b, diaFin);
    if (y > x) ms += y - x;
  }
  return ms / 3600000;
}

async function todasLasFilas<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, tamano = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; ; i += tamano) {
    const { data, error } = await consulta(i, i + tamano - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < tamano) break;
  }
  return out;
}

export async function analisisVentasMl(supabase: SupabaseClient, desde: Date, hasta: Date): Promise<ResultadoAnalisis> {
  const servicio = createServiceClient();
  const desdeIso = desde.toISOString();
  const hastaIso = hasta.toISOString();
  const ahora = Date.now();
  const finReal = Math.min(hasta.getTime(), ahora);

  const [publicaciones, vinculos, { data: movimientos }, { data: configuracion }, piezasPorCajaPorSku] = await Promise.all([
    obtenerPublicaciones(),
    obtenerVinculos(),
    supabase.from("movimientos_stock").select("*").returns<MovimientoStock[]>(),
    supabase.from("configuracion_stock").select("*").maybeSingle<ConfiguracionStock>(),
    obtenerPiezasPorCajaPorSku(supabase),
  ]);
  const diasEspera = configuracion?.dias_espera ?? 60;
  const mapaVinculos = new Map(vinculos.map((v) => [claveVinculo(v.item_id, v.variation_id), v.sku_crm]));
  const factores = factoresVinculos(vinculos);
  const resumenes = resumenPorSku(movimientos ?? [], diasEspera, piezasPorCajaPorSku);
  const skusCrm = new Set(resumenes.map((r) => r.sku));
  const stockBodegaPorSku = new Map(resumenes.map((r) => [r.sku, r.stockActual]));
  const full = resumenFull(publicaciones, mapaVinculos, skusCrm, new Map(), factores);

  // Tramos del historial que tocan el periodo.
  let tramos: Tramo[] = [];
  let faltaSql = false;
  let primeraFoto: string | null = null;
  try {
    tramos = await todasLasFilas<Tramo>((a, b) =>
      servicio
        .from("mercadolibre_publicaciones_historial")
        .select("item_id, variation_id, inventory_id, activa, con_stock, desde, hasta")
        .lte("desde", hastaIso)
        .gte("hasta", desdeIso)
        .order("desde")
        .range(a, b),
    );
    const { data: primera } = await servicio.from("mercadolibre_publicaciones_historial").select("desde").order("desde").limit(1).maybeSingle<{ desde: string }>();
    primeraFoto = primera?.desde ?? null;
  } catch {
    faltaSql = true;
  }

  // Ventas pagadas del periodo.
  const ordenes = await todasLasFilas<{ id: number; fecha_creacion: string }>((a, b) =>
    servicio
      .from("mercadolibre_ordenes")
      .select("id, fecha_creacion")
      .eq("estado", "paid")
      .gte("fecha_creacion", desdeIso)
      .lt("fecha_creacion", hastaIso)
      .order("fecha_creacion")
      .range(a, b),
  );
  const fechaOrden = new Map(ordenes.map((o) => [o.id, o.fecha_creacion]));
  const items: OrdenItemMl[] = ordenes.length ? await itemsDeOrdenes(ordenes.map((o) => o.id), "orden_id, item_id, variation_id, titulo, cantidad, imagen_url, variacion") : [];

  // Agrupación: por producto del CRM si está ligado; si no, por inventario
  // de Full (o relación tradicional↔catálogo); si no, por publicación.
  // OJO (Isaac, 6 oct: "publicaciones que ya están ligadas las veo sin
  // ligar"): la liga se guarda en UNA publicación del grupo (la tradicional)
  // y su publicación de catálogo comparte el stock — aquí hereda la liga de
  // cualquier publicación con la que comparta inventario/relación, igual
  // que en la pantalla de Publicaciones.
  const claveCompartida = (p: PublicacionMl) => {
    if (p.inventory_id) return `inv:${p.inventory_id}`;
    if (p.relacion_item_id) return `rel:${[p.item_id, p.relacion_item_id].sort().join("|")}|${p.variation_id ?? 0}`;
    return `pub:${claveVinculo(p.item_id, p.variation_id)}`;
  };
  const ligaCompartida = new Map<string, { sku: string; factor: number }>();
  for (const p of publicaciones) {
    const { sku } = skuCrmDe(p, mapaVinculos, skusCrm);
    if (!sku) continue;
    const k = claveCompartida(p);
    if (!ligaCompartida.has(k)) ligaCompartida.set(k, { sku, factor: factorDePublicacion(p.item_id, p.variation_id, factores) });
  }
  const ligaDe = (p: PublicacionMl): { sku: string | null; factor: number } => {
    const directa = skuCrmDe(p, mapaVinculos, skusCrm).sku;
    if (directa) return { sku: directa, factor: factorDePublicacion(p.item_id, p.variation_id, factores) };
    return ligaCompartida.get(claveCompartida(p)) ?? { sku: null, factor: 1 };
  };
  const claveGrupoDe = (p: PublicacionMl) => {
    const { sku } = ligaDe(p);
    return sku ? `sku:${sku}` : claveCompartida(p);
  };
  interface Grupo {
    clave: string;
    sku: string | null;
    pubs: PublicacionMl[];
    titulo: string;
    variacion: string | null;
    imagenUrl: string | null;
    disponible: Intervalo[];
    sinStock: Intervalo[];
    conDatos: Intervalo[];
    ventasPorDia: Map<string, number>;
    piezas: number;
  }
  const grupos = new Map<string, Grupo>();
  const grupoDe = (clave: string, base: { sku: string | null; titulo: string; variacion: string | null; imagenUrl: string | null }) => {
    let g = grupos.get(clave);
    if (!g) {
      g = { clave, ...base, pubs: [], disponible: [], sinStock: [], conDatos: [], ventasPorDia: new Map(), piezas: 0 };
      grupos.set(clave, g);
    }
    return g;
  };
  const pubAGrupo = new Map<string, string>();
  // Piezas del CRM por unidad vendida en ML (un par = 2 piezas).
  const factorPub = new Map<string, number>();
  for (const p of publicaciones) {
    const clave = claveGrupoDe(p);
    const { sku, factor } = ligaDe(p);
    factorPub.set(claveVinculo(p.item_id, p.variation_id), factor);
    const g = grupoDe(clave, { sku, titulo: p.titulo ?? sku ?? p.item_id, variacion: p.variacion, imagenUrl: p.imagen_url });
    // La tradicional manda sobre la de catálogo para el título/foto.
    if (!p.catalogo && g.pubs.some((x) => x.catalogo)) {
      g.titulo = p.titulo ?? g.titulo;
      g.imagenUrl = p.imagen_url ?? g.imagenUrl;
    }
    g.pubs.push(p);
    pubAGrupo.set(claveVinculo(p.item_id, p.variation_id), clave);
  }

  // Tramos → intervalos por grupo (clip al periodo y a "ahora").
  const d0 = desde.getTime();
  for (const t of tramos) {
    const clave = pubAGrupo.get(claveVinculo(t.item_id, t.variation_id)) ?? pubAGrupo.get(claveVinculo(t.item_id, null)) ?? `pub:${claveVinculo(t.item_id, t.variation_id)}`;
    const g = grupoDe(clave, { sku: null, titulo: t.item_id, variacion: null, imagenUrl: null });
    const a = Math.max(new Date(t.desde).getTime(), d0);
    const b = Math.min(new Date(t.hasta).getTime(), finReal);
    if (b <= a) continue;
    g.conDatos.push([a, b]);
    if (t.activa && t.con_stock) g.disponible.push([a, b]);
    else if (t.activa) g.sinStock.push([a, b]);
  }

  // Ventas → grupo y día (CDMX).
  for (const it of items) {
    if (!it.item_id) continue;
    const clave = pubAGrupo.get(claveVinculo(it.item_id, it.variation_id)) ?? pubAGrupo.get(claveVinculo(it.item_id, null)) ?? `pub:${claveVinculo(it.item_id, it.variation_id)}`;
    const g = grupoDe(clave, { sku: null, titulo: it.titulo ?? it.item_id, variacion: it.variacion, imagenUrl: it.imagen_url });
    const fecha = fechaOrden.get(it.orden_id);
    if (!fecha) continue;
    const dia = fechaTextoMx(new Date(fecha));
    const factor = factorPub.get(claveVinculo(it.item_id, it.variation_id)) ?? factorPub.get(claveVinculo(it.item_id, null)) ?? 1;
    const piezas = (Number(it.cantidad) || 0) * factor;
    g.ventasPorDia.set(dia, (g.ventasPorDia.get(dia) ?? 0) + piezas);
    g.piezas += piezas;
  }

  // Días del periodo (calendario CDMX).
  const dias: { dia: string; inicio: number; fin: number }[] = [];
  for (let t = inicioDelDiaMx(desde).getTime(); t < Math.min(hasta.getTime(), ahora + DIA_MS); t += DIA_MS) {
    const inicio = Math.max(t, d0);
    const fin = Math.min(t + DIA_MS, hasta.getTime());
    if (fin > inicio) dias.push({ dia: fechaTextoMx(new Date(t + DIA_MS / 2)), inicio, fin });
  }
  const diasPeriodo = Math.max(1, Math.round((Math.min(hasta.getTime(), ahora) - d0) / DIA_MS * 10) / 10);

  const filas: FilaAnalisis[] = [];
  for (const g of grupos.values()) {
    if (g.piezas === 0 && g.disponible.length === 0 && g.pubs.every((p) => p.estado !== "active")) continue;
    const disponible = unir(g.disponible);
    const sinStock = restar(unir(g.sinStock), disponible);
    const conDatos = unir(g.conDatos);
    let diasDisponible = 0;
    let diasSinStock = 0;
    let diasSinDatos = 0;
    let diasAproximados = 0;
    const diario: DiaAnalisis[] = dias.map((d) => {
      const horasDia = (d.fin - d.inicio) / 3600000;
      const hDisp = horasEnDia(disponible, d.inicio, d.fin);
      const hSin = horasEnDia(sinStock, d.inicio, d.fin);
      const hDatos = horasEnDia(conDatos, d.inicio, d.fin);
      const ventas = g.ventasPorDia.get(d.dia) ?? 0;
      const sinDatos = hDatos < Math.min(1, horasDia / 2);
      let fraccionDisp = hDisp / horasDia;
      if (sinDatos && ventas > 0) {
        // Antes del historial: un día con ventas cuenta como disponible (aprox.).
        fraccionDisp = Math.min(1, horasDia / 24);
        diasAproximados += 1;
      }
      if (sinDatos) diasSinDatos += 1;
      diasDisponible += fraccionDisp;
      diasSinStock += hSin / horasDia;
      return { dia: d.dia, disponible: Math.min(1, fraccionDisp), sinStock: Math.min(1, hSin / horasDia), sinDatos, ventas };
    });
    const ventasPorDia = diasDisponible >= 0.25 ? g.piezas / diasDisponible : null;
    const stockBodega = g.sku ? (stockBodegaPorSku.get(g.sku) ?? 0) : 0;
    const stockFull = g.sku ? (full.porSku.get(g.sku) ?? 0) : sumaFullSinLiga(g.pubs);
    const stockHoy = stockBodega + stockFull;
    const diasAlcanza = ventasPorDia && ventasPorDia > 0 ? stockHoy / ventasPorDia : null;
    const sugeridoPedir = ventasPorDia ? Math.max(0, Math.ceil(ventasPorDia * diasEspera - stockHoy)) : 0;
    filas.push({
      clave: g.clave,
      titulo: g.titulo,
      variacion: g.variacion,
      imagenUrl: g.imagenUrl,
      sku: g.sku,
      itemIds: Array.from(new Set(g.pubs.map((p) => p.item_id))),
      diasPeriodo,
      diasDisponible: Math.round(diasDisponible * 10) / 10,
      diasSinStock: Math.round(diasSinStock * 10) / 10,
      diasSinDatos,
      diasAproximados,
      piezasVendidas: g.piezas,
      ventasPorDia: ventasPorDia === null ? null : Math.round(ventasPorDia * 100) / 100,
      proyeccion30: ventasPorDia === null ? null : Math.round(ventasPorDia * 30),
      stockBodega,
      stockFull,
      stockHoy,
      diasAlcanza: diasAlcanza === null ? null : Math.round(diasAlcanza * 10) / 10,
      sugeridoPedir,
      diario,
    });
  }
  filas.sort((a, b) => (b.ventasPorDia ?? -1) - (a.ventasPorDia ?? -1) || b.piezasVendidas - a.piezasVendidas);
  return { filas, diasEspera, desde: desdeIso, hasta: hastaIso, primeraFoto, faltaSql };
}

function sumaFullSinLiga(pubs: PublicacionMl[]) {
  const vistos = new Set<string>();
  let total = 0;
  for (const p of pubs) {
    if (!p.inventory_id || p.full_disponible === null || vistos.has(p.inventory_id)) continue;
    vistos.add(p.inventory_id);
    total += p.full_disponible;
  }
  return total;
}

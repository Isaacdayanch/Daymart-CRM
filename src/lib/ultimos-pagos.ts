// "Proponer lo que hice la última vez" (Isaac, 6 oct: "cada vez que haga un
// pago a un proveedor, que al próximo me proponga lo de la última vez; casi
// siempre se paga de la misma forma a cada proveedor").
//
// Junta el último pago a cada proveedor de las tres fuentes donde se pagan
// proveedores: abonos de deuda (Finanzas → Proveedores), pagos de factura
// (Facturas) y envíos a China (botón "Pagar a proveedores"). Gana el más
// reciente por fecha. Los formularios solo PROPONEN estos valores; Isaac
// siempre puede cambiarlos antes de guardar.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Moneda } from "./tipos";

export interface UltimoPagoProveedor {
  proveedor: string;
  fecha: string;
  /** Cuenta de la que salió (null = "sin cuenta"). */
  cuentaId: string | null;
  moneda: Moneda;
  /** Cómo se mandó: a través de una cuenta puente o directo. */
  via: "PUENTE" | "DIRECTO";
  cuentaPuenteId: string | null;
  /** % de comisión que cobró la cuenta puente (si se supo). */
  comisionPct: number | null;
  origen: "abono" | "factura" | "china";
}

export type UltimosPagos = Record<string, UltimoPagoProveedor>;

export function claveProveedor(nombre: string | null | undefined) {
  return (nombre ?? "").trim().toLowerCase();
}

function masReciente(mapa: UltimosPagos, u: UltimoPagoProveedor) {
  const k = claveProveedor(u.proveedor);
  if (!k) return;
  const actual = mapa[k];
  if (!actual || u.fecha > actual.fecha) mapa[k] = u;
}

export async function ultimosPagosPorProveedor(supabase: SupabaseClient): Promise<UltimosPagos> {
  const mapa: UltimosPagos = {};

  const [{ data: abonos }, { data: envios }, { data: pagos }] = await Promise.all([
    supabase
      .from("movimientos_deuda_proveedor")
      .select("proveedor, fecha, cuenta_id, moneda")
      .eq("tipo", "ABONO")
      .returns<{ proveedor: string; fecha: string; cuenta_id: string | null; moneda: Moneda }[]>(),
    supabase
      .from("envios_china")
      .select("proveedor, fecha, cuenta_origen_id, cuenta_puente_id, moneda_proveedor, monto_pesos, comision_pesos, estado")
      .neq("estado", "CANCELADO")
      .returns<{ proveedor: string; fecha: string; cuenta_origen_id: string | null; cuenta_puente_id: string | null; moneda_proveedor: Moneda; monto_pesos: number; comision_pesos: number | null }[]>(),
    supabase
      .from("pagos_factura")
      .select("fecha, cuenta_id, movimiento_financiero_id, factura:facturas_pendientes(proveedor, moneda)")
      .returns<{ fecha: string; cuenta_id: string | null; movimiento_financiero_id: string | null; factura: { proveedor: string; moneda: Moneda } | { proveedor: string; moneda: Moneda }[] | null }[]>(),
  ]);

  for (const a of abonos ?? []) {
    masReciente(mapa, { proveedor: a.proveedor, fecha: a.fecha, cuentaId: a.cuenta_id, moneda: a.moneda, via: "DIRECTO", cuentaPuenteId: null, comisionPct: null, origen: "abono" });
  }

  for (const e of envios ?? []) {
    const pct = e.comision_pesos && e.monto_pesos ? Math.round((Number(e.comision_pesos) / Number(e.monto_pesos)) * 10000) / 100 : null;
    masReciente(mapa, {
      proveedor: e.proveedor,
      fecha: e.fecha,
      cuentaId: e.cuenta_origen_id,
      moneda: e.moneda_proveedor,
      via: e.cuenta_puente_id ? "PUENTE" : "DIRECTO",
      cuentaPuenteId: e.cuenta_puente_id,
      comisionPct: pct,
      origen: "china",
    });
  }

  // Pagos de factura: si su movimiento fue una TRANSFERENCIA, fue "a través
  // de una cuenta puente" (la cuenta destino).
  const listaPagos = (pagos ?? []).map((p) => ({ ...p, factura: Array.isArray(p.factura) ? p.factura[0] : p.factura })).filter((p) => p.factura);
  const idsMov = listaPagos.map((p) => p.movimiento_financiero_id).filter((id): id is string => Boolean(id));
  const movPorId = new Map<string, { tipo: string; cuenta_destino_id: string | null }>();
  for (let i = 0; i < idsMov.length; i += 300) {
    const { data } = await supabase
      .from("movimientos_financieros")
      .select("id, tipo, cuenta_destino_id")
      .in("id", idsMov.slice(i, i + 300))
      .returns<{ id: string; tipo: string; cuenta_destino_id: string | null }[]>();
    for (const m of data ?? []) movPorId.set(m.id, m);
  }
  for (const p of listaPagos) {
    const mov = p.movimiento_financiero_id ? movPorId.get(p.movimiento_financiero_id) : undefined;
    const puente = mov?.tipo === "TRANSFERENCIA";
    masReciente(mapa, {
      proveedor: p.factura!.proveedor,
      fecha: p.fecha,
      cuentaId: p.cuenta_id,
      moneda: p.factura!.moneda,
      via: puente ? "PUENTE" : "DIRECTO",
      cuentaPuenteId: puente ? (mov?.cuenta_destino_id ?? null) : null,
      comisionPct: null,
      origen: "factura",
    });
  }

  return mapa;
}

/** Texto corto para el aviso "La última vez…". */
export function textoUltimoPago(u: UltimoPagoProveedor, nombreCuenta: (id: string | null) => string | null, fechaTexto: (iso: string) => string) {
  const cuenta = u.cuentaId ? (nombreCuenta(u.cuentaId) ?? "una cuenta") : "sin cuenta";
  const puente = u.via === "PUENTE" && u.cuentaPuenteId ? ` a través de ${nombreCuenta(u.cuentaPuenteId) ?? "una cuenta puente"}` : "";
  const comision = u.comisionPct ? ` con ${u.comisionPct}% de comisión` : "";
  return `La última vez (${fechaTexto(u.fecha)}) le pagaste desde ${cuenta}${puente} en ${u.moneda}${comision}. Ya lo dejé igual; cámbialo si esta vez es distinto.`;
}

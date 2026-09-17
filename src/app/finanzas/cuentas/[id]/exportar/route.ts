import { NextRequest, NextResponse } from "next/server";
import { cargarEstadoCuenta } from "../datos";

/** El mismo estado de cuenta en CSV (se abre directo en Excel). Requiere
 * sesión como cualquier pantalla de Finanzas — el proxy la exige. */
export const dynamic = "force-dynamic";

function celda(v: string | number) {
  const t = typeof v === "number" ? v.toFixed(2) : v;
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sp = request.nextUrl.searchParams;
  const d = await cargarEstadoCuenta(id, {
    mes: sp.get("mes") ?? undefined,
    desde: sp.get("desde") ?? undefined,
    hasta: sp.get("hasta") ?? undefined,
    moneda: sp.get("moneda") ?? undefined,
  });
  const fecha = (t: string) => t.split("-").reverse().join("/");

  const filas: (string | number)[][] = [
    [`Estado de cuenta — ${d.cuenta.nombre}`],
    [`Periodo: ${d.periodo.etiqueta} (${d.moneda === "USD" ? "dólares" : "pesos"})`],
    [],
    ["Fecha", "Concepto", "Detalle", "Entrada", "Salida", "Saldo"],
    [fecha(d.periodo.desde), "Saldo inicial", "", "", "", d.estado.saldoInicial],
    ...d.estado.renglones.map((r) => [fecha(r.fecha), r.concepto + (r.esAjuste ? " (ajuste)" : ""), r.detalle ?? "", r.entrada || "", r.salida || "", r.saldo]),
    [],
    ["", "Total del periodo", "", d.estado.totalEntradas, d.estado.totalSalidas, d.estado.saldoFinal],
  ];
  const csv = "﻿" + filas.map((f) => f.map(celda).join(",")).join("\r\n");
  const nombre = `estado-cuenta-${d.cuenta.nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${d.periodo.mes ?? `${d.periodo.desde}-a-${d.periodo.hasta}`}.csv`;
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nombre}"` },
  });
}

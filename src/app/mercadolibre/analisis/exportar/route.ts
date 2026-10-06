import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analisisVentasMl } from "@/lib/mercadolibre-analisis";
import { periodoAnalisis } from "../periodo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function celda(v: string | number | null) {
  const t = v === null ? "" : typeof v === "number" ? String(v) : v;
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** El análisis de venta en CSV (se abre directo en Excel). */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const { desde, hasta } = periodoAnalisis({ dias: sp.get("dias") ?? undefined, desde: sp.get("desde") ?? undefined, hasta: sp.get("hasta") ?? undefined });
  const supabase = await createClient();
  const r = await analisisVentasMl(supabase, desde, hasta);
  const filas: (string | number | null)[][] = [
    [`Análisis de venta Mercado Libre — ${r.desde.slice(0, 10)} a ${r.hasta.slice(0, 10)}`],
    [],
    ["Producto", "Variante", "SKU", "Publicaciones", "Días disponible", "Días sin stock", "Días sin datos", "Piezas vendidas", "Ventas por día", "Proyección 30 días", "Stock bodega", "Stock Full", "Te alcanza (días)", `Sugerido pedir (${r.diasEspera} días)`],
    ...r.filas.map((f) => [f.titulo, f.variacion, f.sku, f.itemIds.join(" "), f.diasDisponible, f.diasSinStock, f.diasSinDatos, f.piezasVendidas, f.ventasPorDia, f.proyeccion30, f.stockBodega, f.stockFull, f.diasAlcanza, f.sugeridoPedir]),
  ];
  const csv = "﻿" + filas.map((f) => f.map(celda).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="analisis-venta-ml-${r.desde.slice(0, 10)}-a-${r.hasta.slice(0, 10)}.csv"` },
  });
}

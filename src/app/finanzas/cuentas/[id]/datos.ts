import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { estadoDeCuenta, periodoDeParams } from "@/lib/estado-cuenta";
import { fechaTextoMx } from "@/lib/fechas-mx";
import type { CategoriaFinanciera, CuentaFinanciera, Moneda, MovimientoFinanciero } from "@/lib/tipos";

export interface ParamsPeriodo {
  mes?: string;
  desde?: string;
  hasta?: string;
  moneda?: string;
}

/** Todo lo que necesitan la pantalla, la impresión y el Excel del estado
 * de cuenta — un solo lugar para que los tres digan exactamente lo mismo. */
export async function cargarEstadoCuenta(cuentaId: string, params: ParamsPeriodo) {
  const supabase = await createClient();
  const { data: cuenta } = await supabase.from("cuentas_financieras").select("*").eq("id", cuentaId).maybeSingle<CuentaFinanciera>();
  if (!cuenta) notFound();

  const [{ data: movimientos }, { data: cuentas }, { data: categorias }, { data: pagosMercancia }, { data: movimientosDeuda }, { data: pagosFactura }, { data: cobrosVenta }] =
    await Promise.all([
      supabase
        .from("movimientos_financieros")
        .select("*")
        .or(`cuenta_id.eq.${cuentaId},cuenta_destino_id.eq.${cuentaId}`)
        .returns<MovimientoFinanciero[]>(),
      supabase.from("cuentas_financieras").select("*").returns<CuentaFinanciera[]>(),
      supabase.from("categorias_financieras").select("*").order("orden").returns<CategoriaFinanciera[]>(),
      supabase.from("pagos_mercancia").select("movimiento_financiero_id").not("movimiento_financiero_id", "is", null),
      supabase.from("movimientos_deuda_proveedor").select("movimiento_financiero_id").not("movimiento_financiero_id", "is", null),
      supabase.from("pagos_factura").select("movimiento_financiero_id").not("movimiento_financiero_id", "is", null),
      supabase.from("cobros_venta").select("movimiento_financiero_id").not("movimiento_financiero_id", "is", null),
    ]);

  const hoyTexto = fechaTextoMx(new Date());
  const periodo = periodoDeParams(params, hoyTexto);
  const lista = movimientos ?? [];
  const moneda: Moneda = params.moneda === "USD" ? "USD" : "MXN";
  const tieneUsd = lista.some((m) => m.moneda === "USD");

  const cuentasPorId = new Map((cuentas ?? []).map((c) => [c.id, c.nombre]));
  const categoriasPorId = new Map((categorias ?? []).map((c) => [c.id, c.nombre]));

  // De dónde viene cada movimiento "ligado" (se corrige desde ahí, no aquí).
  const origenLigado = new Map<string, string>();
  const anotar = (filas: { movimiento_financiero_id: string | null }[] | null, origen: string) => {
    for (const f of filas ?? []) if (f.movimiento_financiero_id) origenLigado.set(f.movimiento_financiero_id, origen);
  };
  anotar(pagosMercancia, "un abono de contenedor");
  anotar(movimientosDeuda, "Proveedores");
  anotar(pagosFactura, "un pago de factura");
  anotar(cobrosVenta, "un cobro de venta");

  const estado = estadoDeCuenta({
    cuentaId,
    movimientos: lista,
    moneda,
    desde: periodo.desde,
    hasta: periodo.hasta,
    nombreCuenta: (id) => (id ? (cuentasPorId.get(id) ?? "otra cuenta") : "otra cuenta"),
    nombreCategoria: (id) => (id ? (categoriasPorId.get(id) ?? null) : null),
  });
  const saldoActual = lista.filter((m) => m.moneda === moneda).reduce((s, m) => {
    if (m.tipo === "ENTRADA") return m.cuenta_id === cuentaId ? s + m.monto : s;
    if (m.tipo === "SALIDA") return m.cuenta_id === cuentaId ? s - m.monto : s;
    return m.cuenta_id === cuentaId ? s - m.monto : m.cuenta_destino_id === cuentaId ? s + m.monto : s;
  }, 0);

  return {
    cuenta,
    cuentas: (cuentas ?? []).filter((c) => !c.eliminado_en),
    categorias: (categorias ?? []).filter((c) => !c.eliminado_en),
    periodo,
    moneda,
    tieneUsd,
    estado,
    saldoActual,
    origenLigado,
    hoyTexto,
  };
}

import { createClient } from "@/lib/supabase/server";
import { resumenPorSku } from "@/lib/calculos-stock";
import { obtenerPiezasPorCajaPorSku } from "@/lib/productos-stock";
import type { Bodega, Cliente, ConfiguracionStock, CuentaFinanciera, MovimientoStock, Venta, VentaLinea } from "@/lib/tipos";
import { FormularioVenta } from "./formulario-venta";

export default async function NuevaVenta() {
  const supabase = await createClient();
  const [
    { data: movimientos },
    { data: bodegas },
    { data: configuracion },
    piezasPorCajaPorSku,
    { data: clientes },
    { data: cuentas },
    { data: ventas },
    { data: lineasPrevias },
  ] = await Promise.all([
    supabase.from("movimientos_stock").select("*").returns<MovimientoStock[]>(),
    supabase.from("bodegas").select("*").is("eliminado_en", null).order("nombre").returns<Bodega[]>(),
    supabase.from("configuracion_stock").select("*").single<ConfiguracionStock>(),
    obtenerPiezasPorCajaPorSku(supabase),
    supabase.from("clientes").select("*").is("eliminado_en", null).order("nombre").returns<Cliente[]>(),
    supabase.from("cuentas_financieras").select("*").is("eliminado_en", null).order("nombre").returns<CuentaFinanciera[]>(),
    supabase.from("ventas").select("*").order("fecha", { ascending: false }).returns<Venta[]>(),
    supabase.from("venta_lineas").select("*").returns<VentaLinea[]>(),
  ]);

  const resumenes = resumenPorSku(movimientos ?? [], configuracion?.dias_espera ?? 60, piezasPorCajaPorSku);

  // Último precio al que se vendió cada SKU (para proponerlo — casi siempre
  // se repite). Las ventas ya vienen de la más reciente a la más vieja.
  const ultimoPrecioPorSku: Record<string, number> = {};
  for (const venta of ventas ?? []) {
    for (const linea of (lineasPrevias ?? []).filter((l) => l.venta_id === venta.id)) {
      if (!(linea.sku in ultimoPrecioPorSku)) ultimoPrecioPorSku[linea.sku] = linea.precio_unitario;
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-zinc-900">Nueva venta</h2>
      <FormularioVenta
        opciones={resumenes
          .filter((r) => r.stockActual > 0)
          .map((r) => ({
            sku: r.sku,
            nombre: r.nombre,
            stockActual: r.stockActual,
            piezasPorCaja: r.piezasPorCaja,
            imagenUrl: r.imagenUrl,
            costoPromedio: r.costoPromedio,
          }))}
        clientes={clientes ?? []}
        bodegas={bodegas ?? []}
        cuentas={cuentas ?? []}
        ultimoPrecioPorSku={ultimoPrecioPorSku}
      />
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { resumenPorSku } from "@/lib/calculos-stock";
import { obtenerPiezasPorCajaPorSku } from "@/lib/productos-stock";
import type { Bodega, ConfiguracionStock, MovimientoStock } from "@/lib/tipos";
import { FormularioConteo } from "./formulario-conteo";

export default async function ConteoFisico() {
  const supabase = await createClient();
  const [{ data: movimientos }, { data: bodegas }, { data: configuracion }, piezasPorCajaPorSku] = await Promise.all([
    supabase.from("movimientos_stock").select("*").returns<MovimientoStock[]>(),
    supabase.from("bodegas").select("*").is("eliminado_en", null).order("nombre").returns<Bodega[]>(),
    supabase.from("configuracion_stock").select("*").single<ConfiguracionStock>(),
    obtenerPiezasPorCajaPorSku(supabase),
  ]);

  const resumenes = resumenPorSku(movimientos ?? [], configuracion?.dias_espera ?? 60, piezasPorCajaPorSku);

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-lg font-semibold text-zinc-900">Revisar inventario</h1>
      {(bodegas ?? []).length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          Necesitas al menos una bodega antes de poder ajustar — ve a Bodegas y agrega una.
        </div>
      ) : resumenes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
          Todavía no hay movimientos de stock que revisar.
        </div>
      ) : (
        <FormularioConteo resumenes={resumenes} bodegas={bodegas ?? []} />
      )}
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { resumenPorSku } from "@/lib/calculos-stock";
import type { Bodega, ConfiguracionStock, MovimientoStock } from "@/lib/tipos";
import { FormularioSalidas } from "./formulario-salidas";

export default async function Salidas() {
  const supabase = await createClient();
  const [{ data: movimientos }, { data: bodegas }, { data: configuracion }] = await Promise.all([
    supabase.from("movimientos_stock").select("*").returns<MovimientoStock[]>(),
    supabase.from("bodegas").select("*").is("eliminado_en", null).order("nombre").returns<Bodega[]>(),
    supabase.from("configuracion_stock").select("*").single<ConfiguracionStock>(),
  ]);

  const resumenes = resumenPorSku(movimientos ?? [], configuracion?.dias_espera ?? 60);
  const listaBodegas = bodegas ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Ve agregando lo que va saliendo de bodega y al final le das &ldquo;Registrar salidas&rdquo; para
        guardarlo todo junto.
      </p>
      <FormularioSalidas
        opciones={resumenes.map((r) => ({
          sku: r.sku,
          nombre: r.nombre,
          stockActual: r.stockActual,
          piezasPorCaja: r.piezasPorCaja,
          imagenUrl: r.imagenUrl,
        }))}
        bodegas={listaBodegas}
      />
    </div>
  );
}

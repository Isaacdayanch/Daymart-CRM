import { createClient } from "@/lib/supabase/server";
import type { ConfiguracionStock } from "@/lib/tipos";
import { actualizarDiasEspera } from "../actions";

export default async function ConfiguracionStockPage() {
  const supabase = await createClient();
  const { data: configuracion } = await supabase
    .from("configuracion_stock")
    .select("*")
    .single<ConfiguracionStock>();

  return (
    <div className="max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">Tiempo de espera para reórdenes</h2>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
        Cuántos días tarda en llegarte un pedido nuevo desde que lo haces hasta que está en bodega. Se usa
        para calcular el punto de reorden de cada producto (rotación diaria × este número).
      </p>
      <form action={actualizarDiasEspera} className="mt-4 flex items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Días</label>
          <input
            type="number"
            name="dias_espera"
            min={1}
            defaultValue={configuracion?.dias_espera ?? 60}
            className="mt-1 block w-28 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
        >
          Guardar
        </button>
      </form>
    </div>
  );
}

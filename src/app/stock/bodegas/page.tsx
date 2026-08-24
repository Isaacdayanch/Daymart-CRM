import { createClient } from "@/lib/supabase/server";
import { formatoFecha } from "@/lib/formato";
import type { Bodega } from "@/lib/tipos";
import { agregarBodega, eliminarBodega } from "../actions";

export default async function BodegasStock() {
  const supabase = await createClient();
  const { data: bodegas } = await supabase
    .from("bodegas")
    .select("*")
    .is("eliminado_en", null)
    .order("creado_en", { ascending: true })
    .returns<Bodega[]>();

  const listaBodegas = bodegas ?? [];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Nueva bodega</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Hoy manejas una, pero puedes agregar más cuando lo necesites (otra ciudad, un 3PL, etc.).
        </p>
        <form action={agregarBodega} className="mt-4 flex gap-2">
          <input
            type="text"
            name="nombre"
            required
            placeholder="Ej. Bodega CDMX"
            className="block w-full max-w-xs rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
          >
            Agregar
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="divide-y divide-zinc-100">
          {listaBodegas.map((bodega) => (
            <div key={bodega.id} className="flex items-center justify-between px-6 py-4">
              <div>
                <p className="text-sm font-medium text-zinc-900">{bodega.nombre}</p>
                <p className="text-xs text-zinc-400">Desde {formatoFecha(bodega.creado_en)}</p>
              </div>
              {listaBodegas.length > 1 && (
                <form action={eliminarBodega.bind(null, bodega.id)}>
                  <button type="submit" className="text-sm font-medium text-red-600 hover:text-red-800">
                    Quitar
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

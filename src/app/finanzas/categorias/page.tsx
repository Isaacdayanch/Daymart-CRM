import { createClient } from "@/lib/supabase/server";
import type { CategoriaFinanciera } from "@/lib/tipos";
import { agregarCategoria, eliminarCategoria, renombrarCategoria } from "../actions";

export default async function CategoriasFinanzas() {
  const supabase = await createClient();
  const { data: categorias } = await supabase
    .from("categorias_financieras")
    .select("*")
    .is("eliminado_en", null)
    .order("orden", { ascending: true })
    .returns<CategoriaFinanciera[]>();

  const lista = categorias ?? [];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Nueva categoría</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Mantenlas pocas y claras — es más fácil ver a dónde se va el dinero.
        </p>
        <form action={agregarCategoria} className="mt-4 flex gap-2">
          <input
            type="text"
            name="nombre"
            required
            placeholder="Ej. Renta de oficina"
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
          {lista.map((categoria) => (
            <div key={categoria.id} className="flex items-center justify-between gap-4 px-6 py-3.5">
              <form
                action={renombrarCategoria.bind(null, categoria.id)}
                className="flex flex-1 items-center gap-2"
              >
                <input
                  type="text"
                  name="nombre"
                  defaultValue={categoria.nombre}
                  className="w-full max-w-xs rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-zinc-900 transition hover:border-zinc-200 focus:border-zinc-300 focus:bg-white focus:ring-zinc-500"
                />
                <button type="submit" className="text-xs font-medium text-zinc-400 hover:text-zinc-900">
                  Guardar
                </button>
              </form>
              {categoria.fija ? (
                <span className="text-xs text-zinc-400">Fija</span>
              ) : (
                <form action={eliminarCategoria.bind(null, categoria.id)}>
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

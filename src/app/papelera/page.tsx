import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatoFecha } from "@/lib/formato";
import type { Contenedor } from "@/lib/tipos";
import { FilaPapelera } from "./fila-papelera";

export default async function Papelera() {
  const supabase = await createClient();
  const { data: contenedores } = await supabase
    .from("contenedores")
    .select("*")
    .not("eliminado_en", "is", null)
    .order("eliminado_en", { ascending: false })
    .returns<Contenedor[]>();

  const lista = contenedores ?? [];

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Daymart</p>
            <h1 className="text-lg font-semibold text-zinc-900">Papelera</h1>
          </div>
          <Link href="/" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
            ← Volver a la lista
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="mb-4 text-sm text-zinc-500">
          Los contenedores que borras se quedan aquí hasta que tú decidas restaurarlos o
          borrarlos de verdad — nada se pierde por accidente.
        </p>

        {lista.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center text-sm text-zinc-500">
            La papelera está vacía.
          </div>
        )}

        {lista.length > 0 && (
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
            {lista.map((contenedor) => (
              <li key={contenedor.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium text-zinc-900">Contenedor {contenedor.numero}</p>
                  <p className="text-xs text-zinc-500">
                    Borrado el {contenedor.eliminado_en ? formatoFecha(contenedor.eliminado_en) : ""}
                  </p>
                </div>
                <FilaPapelera contenedor={contenedor} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

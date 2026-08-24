import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { costoTotalContenedor } from "@/lib/calculos";
import { formatoPesos, ESTILO_ESTADO } from "@/lib/formato";
import { ESTADOS_CONTENEDOR, type Contenedor, type PagoMercancia } from "@/lib/tipos";

function etiquetaEstado(estado: Contenedor["estado"]) {
  return ESTADOS_CONTENEDOR.find((e) => e.valor === estado)?.etiqueta ?? estado;
}

export default async function Home() {
  const supabase = await createClient();
  const { data: contenedores, error } = await supabase
    .from("contenedores")
    .select("*")
    .is("eliminado_en", null)
    .order("numero", { ascending: false })
    .returns<Contenedor[]>();

  const { data: pagosMercancia } = await supabase
    .from("pagos_mercancia")
    .select("*")
    .returns<PagoMercancia[]>();

  function pagosDe(contenedorId: string) {
    return pagosMercancia?.filter((p) => p.contenedor_id === contenedorId) ?? [];
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Daymart</p>
            <h1 className="text-lg font-semibold text-zinc-900">Pedidos / Contenedores</h1>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/stock" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
              Stock
            </Link>
            <Link href="/papelera" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
              Papelera
            </Link>
            <Link
              href="/contenedores/nuevo"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              + Nuevo contenedor
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            No se pudieron cargar los contenedores: {error.message}
          </div>
        )}

        {!error && contenedores?.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center">
            <p className="text-base font-medium text-zinc-900">Aún no tienes contenedores</p>
            <p className="mt-1 text-sm text-zinc-500">
              Agrega tu primer contenedor para empezar a llevar el control de tus pedidos.
            </p>
            <Link
              href="/contenedores/nuevo"
              className="mt-4 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              + Nuevo contenedor
            </Link>
          </div>
        )}

        {contenedores && contenedores.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {contenedores.map((contenedor) => (
              <li key={contenedor.id}>
                <Link
                  href={`/contenedores/${contenedor.id}`}
                  className="block rounded-xl border border-zinc-200 bg-white p-5 transition hover:border-zinc-300 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-zinc-900">
                        Contenedor {contenedor.numero}
                      </p>
                      <p className="text-sm text-zinc-500">
                        {contenedor.booking || "Sin booking"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${ESTILO_ESTADO[contenedor.estado]}`}
                    >
                      {etiquetaEstado(contenedor.estado)}
                    </span>
                  </div>
                  <div className="mt-4 flex items-baseline justify-between border-t border-zinc-100 pt-3">
                    <span className="text-xs text-zinc-500">Costo total del contenedor</span>
                    <span className="text-sm font-semibold text-zinc-900">
                      {formatoPesos(costoTotalContenedor(contenedor, pagosDe(contenedor.id)))}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

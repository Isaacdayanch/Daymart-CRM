import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { TarjetaProductoVendedores } from "@/components/catalogo-vendedores";
import { cargarCatalogoPublico, filtrosDeParams, obtenerAccesoPorToken, queryDeFiltros } from "@/lib/catalogo-vendedores";

export const dynamic = "force-dynamic";

/** Catálogo público para un vendedor externo (migración 0043). Sin login:
 * el token del link es la llave. Solo ficha del producto + piezas en bodega;
 * NUNCA precios, costos, contenedores ni Finanzas. */
export default async function CatalogoPublico({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { token } = await params;
  const acceso = await obtenerAccesoPorToken(token, true);
  if (!acceso) notFound();

  const sp = await searchParams;
  const filtros = filtrosDeParams(sp);
  const { productos, categorias, marcas, total } = await cargarCatalogoPublico(filtros);
  const base = `/catalogo/${token}`;
  const hrefCon = (cambios: Partial<typeof filtros>) => `${base}${queryDeFiltros({ ...filtros, ...cambios })}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <Logo href={base} />
            <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-zinc-900">Catálogo de productos</h1>
          </div>
          <a
            href={`${base}/imprimir${queryDeFiltros(filtros)}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Descargar PDF
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <p className="text-sm text-zinc-500">
          Hola, <span className="font-medium text-zinc-800">{acceso.nombre}</span>. Las cantidades son las piezas disponibles en bodega al día de hoy.
        </p>

        <form action={base} className="mt-4 flex flex-wrap items-center gap-2">
          {filtros.categoria && <input type="hidden" name="categoria" value={filtros.categoria} />}
          {filtros.marca && <input type="hidden" name="marca" value={filtros.marca} />}
          {!filtros.soloConStock && <input type="hidden" name="todos" value="1" />}
          <input
            type="search"
            name="q"
            defaultValue={filtros.q ?? ""}
            placeholder="Buscar producto…"
            className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500 sm:w-72"
          />
          <button type="submit" className="rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
            Buscar
          </button>
        </form>

        {categorias.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
            <Link href={hrefCon({ categoria: undefined })} className={`rounded-full px-3 py-1.5 ${!filtros.categoria ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:text-zinc-900"}`}>
              Todas
            </Link>
            {categorias.map((c) => (
              <Link key={c} href={hrefCon({ categoria: c })} className={`rounded-full px-3 py-1.5 ${filtros.categoria === c ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:text-zinc-900"}`}>
                {c}
              </Link>
            ))}
          </div>
        )}
        {marcas.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            <Link href={hrefCon({ marca: undefined })} className={`rounded-full px-3 py-1.5 ${!filtros.marca ? "bg-zinc-100 text-zinc-900" : "text-zinc-500 hover:text-zinc-900"}`}>
              Todas las marcas
            </Link>
            {marcas.map((m) => (
              <Link key={m.id} href={hrefCon({ marca: m.nombre })} className={`rounded-full px-3 py-1.5 ${filtros.marca === m.nombre ? "bg-zinc-100 text-zinc-900" : "text-zinc-500 hover:text-zinc-900"}`}>
                {m.nombre}
              </Link>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
          <p>
            {productos.length} producto(s){filtros.soloConStock ? " con piezas disponibles" : ""}
            {total > productos.length && filtros.soloConStock && <> · <Link href={hrefCon({ soloConStock: false })} className="underline-offset-2 hover:underline">ver también agotados</Link></>}
            {!filtros.soloConStock && <> · <Link href={hrefCon({ soloConStock: true })} className="underline-offset-2 hover:underline">solo con existencia</Link></>}
          </p>
        </div>

        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {productos.map((p) => (
            <TarjetaProductoVendedores key={p.sku} p={p} />
          ))}
        </ul>
        {productos.length === 0 && <p className="py-16 text-center text-sm text-zinc-400">Ningún producto con ese filtro.</p>}

        <p className="mt-10 text-center text-[11px] text-zinc-400">Catálogo privado de Daymart. Las existencias cambian todos los días; confirma antes de ofrecer.</p>
      </main>
    </div>
  );
}

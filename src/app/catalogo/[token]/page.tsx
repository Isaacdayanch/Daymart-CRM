import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { TarjetaProductoVendedores, type OpcionesVista } from "@/components/catalogo-vendedores";
import { cargarCatalogoPublico, filtrosDeParams, obtenerVendedorPorToken, queryDeFiltros } from "@/lib/catalogo-vendedores";
import { BotonesCompartir } from "./compartir";

export const dynamic = "force-dynamic";

/** Catálogo público (módulo Vendedores, migración 0044). Sin login: el
 * token del link es la llave. Dos modos según el token:
 *  - link privado del vendedor: precio, su comisión y piezas exactas;
 *  - link para sus clientes: sin cantidades exactas y sin precio (salvo
 *    que Isaac lo active para ese vendedor).
 * NUNCA costos, contenedores ni Finanzas. */
export default async function CatalogoPublico({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { token } = await params;
  const acceso = await obtenerVendedorPorToken(token, true);
  if (!acceso) notFound();
  const { vendedor, modo } = acceso;
  const vista: OpcionesVista = { modo, conPrecios: vendedor.clientes_ven_precios, conComision: modo === "vendedor" };

  const sp = await searchParams;
  const filtros = filtrosDeParams(sp);
  const { productos, categorias, marcas, total } = await cargarCatalogoPublico(vendedor, modo, filtros);
  const base = `/catalogo/${token}`;
  const hrefCon = (cambios: Partial<typeof filtros>) => `${base}${queryDeFiltros({ ...filtros, ...cambios })}`;
  const esVendedor = modo === "vendedor";

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <Logo href={base} />
            <h1 className="mt-0.5 truncate text-lg font-semibold tracking-tight text-zinc-900">{esVendedor ? "Catálogo de productos" : `Catálogo de ${vendedor.nombre}`}</h1>
          </div>
          <a
            href={`${base}/imprimir${queryDeFiltros(filtros)}`}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Descargar PDF
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {esVendedor ? (
          <>
            <p className="text-sm text-zinc-600">
              Hola, <span className="font-medium text-zinc-900">{vendedor.nombre}</span>. Aquí ves el precio de venta, tu comisión por pieza y las piezas disponibles en bodega hoy.
            </p>
            <BotonesCompartir linkClientes={`/catalogo/${vendedor.token_clientes}`} nombre={vendedor.nombre} />
          </>
        ) : (
          <p className="text-sm text-zinc-600">
            Para pedidos o dudas contacta a <span className="font-medium text-zinc-900">{vendedor.nombre}</span>
            {vendedor.telefono && (
              <>
                {" · "}
                <a href={`https://wa.me/${vendedor.telefono.replace(/\D/g, "")}`} className="font-medium text-emerald-700 hover:underline">
                  {vendedor.telefono}
                </a>
              </>
            )}
            .
          </p>
        )}

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

        <p className="mt-4 text-xs text-zinc-500">
          {productos.length} producto(s){filtros.soloConStock ? " disponibles" : ""}
          {total > productos.length && filtros.soloConStock && <> · <Link href={hrefCon({ soloConStock: false })} className="underline-offset-2 hover:underline">ver también agotados</Link></>}
          {!filtros.soloConStock && <> · <Link href={hrefCon({ soloConStock: true })} className="underline-offset-2 hover:underline">solo disponibles</Link></>}
        </p>

        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {productos.map((p) => (
            <TarjetaProductoVendedores key={p.sku} p={p} vista={vista} />
          ))}
        </ul>
        {productos.length === 0 && <p className="py-16 text-center text-sm text-zinc-400">Ningún producto con ese filtro.</p>}

        <p className="mt-10 text-center text-[11px] text-zinc-400">
          {esVendedor ? "Catálogo privado de Daymart. Las existencias cambian todos los días; confirma antes de ofrecer." : "Las existencias cambian todos los días. Confirma disponibilidad antes de comprar."}
        </p>
      </main>
    </div>
  );
}

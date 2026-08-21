import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cartones, cbmProducto, cbmTotalContenedor, costoFinalPorPieza, costoPorCbmContenedor, tipoCambioPromedioMercancia } from "@/lib/calculos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import type { Contenedor, PagoMercancia, Producto } from "@/lib/tipos";
import { BotonImprimir } from "./boton-imprimir";

export default async function ImprimirContenedor({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ precios?: string }>;
}) {
  const { id } = await params;
  const { precios } = await searchParams;
  const conPrecios = precios !== "no";

  const supabase = await createClient();

  const { data: contenedor } = await supabase
    .from("contenedores")
    .select("*")
    .eq("id", id)
    .single<Contenedor>();

  if (!contenedor) notFound();

  const [{ data: productos }, { data: abonos }] = await Promise.all([
    supabase.from("productos").select("*").eq("contenedor_id", id).returns<Producto[]>(),
  supabase.from("pagos_mercancia").select("*").eq("contenedor_id", id).returns<PagoMercancia[]>(),
  ]);

  const listaProductos = productos ?? [];
  const listaAbonos = abonos ?? [];
  const costoPorCbm = costoPorCbmContenedor(contenedor, listaProductos);
  const tipoCambioMercancia = tipoCambioPromedioMercancia(listaAbonos);
  const cbmTotal = cbmTotalContenedor(listaProductos);
  const cantidadTotal = listaProductos.reduce((suma, p) => suma + p.cantidad, 0);

  return (
    <div className="min-h-screen bg-zinc-50 print:bg-white">
      <div className="mx-auto max-w-4xl px-4 py-6 print:hidden sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/contenedores/${id}`} className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
            ← Volver al contenedor
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex overflow-hidden rounded-lg border border-zinc-300 text-xs">
              <Link
                href={`/contenedores/${id}/imprimir?precios=si`}
                className={`px-3 py-1.5 ${conPrecios ? "bg-zinc-900 text-white" : "bg-white text-zinc-600"}`}
              >
                Con precios
              </Link>
              <Link
                href={`/contenedores/${id}/imprimir?precios=no`}
                className={`px-3 py-1.5 ${!conPrecios ? "bg-zinc-900 text-white" : "bg-white text-zinc-600"}`}
              >
                Sin precios
              </Link>
            </div>
            <BotonImprimir />
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-4xl bg-white px-4 py-8 sm:px-6 print:px-0 print:py-0">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Daymart</p>
            <h1 className="text-xl font-semibold text-zinc-900">
              Packing list — Contenedor {contenedor.numero}
            </h1>
            <p className="text-sm text-zinc-500">
              {contenedor.booking ? `Booking: ${contenedor.booking}` : ""}
            </p>
          </div>
          <p className="text-sm text-zinc-500">{formatoFecha(new Date().toISOString())}</p>
        </div>

        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b-2 border-zinc-900 text-zinc-500">
              <th className="py-2 pr-2 font-medium">Foto</th>
              <th className="py-2 pr-2 font-medium">SKU</th>
              <th className="py-2 pr-2 font-medium">Producto</th>
              <th className="py-2 pr-2 font-medium">Memo</th>
              <th className="py-2 pr-2 font-medium text-right">Cant.</th>
              <th className="py-2 pr-2 font-medium text-right">Ctns.</th>
              <th className="py-2 pr-2 font-medium text-right">Medidas (cm)</th>
              <th className="py-2 pr-2 font-medium text-right">CBM</th>
              {conPrecios && <th className="py-2 pr-2 font-medium text-right">Precio USD</th>}
              {conPrecios && <th className="py-2 pr-2 font-medium text-right">Costo final/pieza</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {listaProductos.map((producto) => (
              <tr key={producto.id}>
                <td className="py-2 pr-2">
                  {producto.imagen_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- se imprime/exporta a PDF, next/image no aplica
                    <img
                      src={producto.imagen_url}
                      alt={producto.nombre}
                      className="h-12 w-12 rounded object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded bg-zinc-100" />
                  )}
                </td>
                <td className="py-2 pr-2 font-mono">{producto.sku}</td>
                <td className="py-2 pr-2">{producto.nombre}</td>
                <td className="py-2 pr-2 text-zinc-500">{producto.memo}</td>
                <td className="py-2 pr-2 text-right">{producto.cantidad}</td>
                <td className="py-2 pr-2 text-right">{cartones(producto).toFixed(1)}</td>
                <td className="py-2 pr-2 text-right">
                  {producto.largo_cm}×{producto.ancho_cm}×{producto.alto_cm}
                </td>
                <td className="py-2 pr-2 text-right">{cbmProducto(producto).toFixed(3)}</td>
                {conPrecios && <td className="py-2 pr-2 text-right">${producto.precio_dolares}</td>}
                {conPrecios && (
                  <td className="py-2 pr-2 text-right font-medium">
                    {formatoPesos(costoFinalPorPieza(producto, costoPorCbm, tipoCambioMercancia))}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-900 font-medium">
              <td className="py-2 pr-2" colSpan={4}>
                Total
              </td>
              <td className="py-2 pr-2 text-right">{cantidadTotal}</td>
              <td className="py-2 pr-2"></td>
              <td className="py-2 pr-2"></td>
              <td className="py-2 pr-2 text-right">{cbmTotal.toFixed(2)}</td>
              {conPrecios && <td className="py-2 pr-2" colSpan={2}></td>}
            </tr>
          </tfoot>
        </table>
      </main>
    </div>
  );
}

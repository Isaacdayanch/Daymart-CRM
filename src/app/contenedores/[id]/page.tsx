import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  cbmTotalContenedor,
  costoPorCbmContenedor,
  costoTotalContenedor,
  tipoCambioPromedioMercancia,
} from "@/lib/calculos";
import { formatoPesos } from "@/lib/formato";
import {
  type Contenedor,
  type DocumentoContenedor,
  type HistorialEstado,
  type PagoMercancia,
  type Producto,
  type TipoDocumento,
} from "@/lib/tipos";
import { FormularioContenedor } from "./formulario-contenedor";
import { Abonos } from "./abonos";
import { Productos } from "./productos";
import { Documentos } from "./documentos";
import { TarjetaEstado } from "./tarjeta-estado";
import { Historial } from "./historial";

export default async function DetalleContenedor({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: contenedor } = await supabase
    .from("contenedores")
    .select("*")
    .eq("id", id)
    .single<Contenedor>();

  if (!contenedor) notFound();

  const [{ data: abonos }, { data: productos }, { data: documentos }, { data: historial }, { data: catalogoCrudo }] =
    await Promise.all([
      supabase
        .from("pagos_mercancia")
        .select("*")
        .eq("contenedor_id", id)
        .returns<PagoMercancia[]>(),
      supabase
        .from("productos")
        .select("*")
        .eq("contenedor_id", id)
        .order("orden", { ascending: true })
        .returns<Producto[]>(),
      supabase
        .from("documentos_contenedor")
        .select("*")
        .eq("contenedor_id", id)
        .returns<DocumentoContenedor[]>(),
      supabase
        .from("historial_estados_contenedor")
        .select("*")
        .eq("contenedor_id", id)
        .returns<HistorialEstado[]>(),
      supabase
        .from("productos")
        .select("*")
        .order("creado_en", { ascending: false })
        .returns<Producto[]>(),
    ]);

  const listaAbonos = abonos ?? [];
  const listaProductos = productos ?? [];
  const listaDocumentos = documentos ?? [];
  const listaHistorial = historial ?? [];

  // Catálogo para "restock": un producto por SKU, el más reciente de
  // cualquier contenedor, para poder rellenar el formulario sin volver
  // a capturar todo desde cero.
  const catalogoPorSku = new Map<string, Producto>();
  for (const p of catalogoCrudo ?? []) {
    if (!catalogoPorSku.has(p.sku)) catalogoPorSku.set(p.sku, p);
  }
  const catalogo = Array.from(catalogoPorSku.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));

  const documentosPorTipo: Partial<Record<TipoDocumento, DocumentoContenedor & { url: string | null }>> = {};
  for (const doc of listaDocumentos) {
    const { data: firmado } = await supabase.storage
      .from("documentos")
      .createSignedUrl(doc.ruta_archivo, 60 * 10);
    documentosPorTipo[doc.tipo] = { ...doc, url: firmado?.signedUrl ?? null };
  }

  const cbmTotal = cbmTotalContenedor(listaProductos);
  const costoPorCbm = costoPorCbmContenedor(contenedor, listaProductos);
  const tipoCambioMercancia = tipoCambioPromedioMercancia(listaAbonos);
  const costoTotal = costoTotalContenedor(contenedor, listaAbonos);

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Daymart</p>
            <h1 className="text-lg font-semibold text-zinc-900">Contenedor {contenedor.numero}</h1>
          </div>
          <Link href="/" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
            ← Volver a la lista
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TarjetaEstado contenedorId={contenedor.id} estado={contenedor.estado} />
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">CBM total</p>
            <p className="mt-1 text-sm font-semibold text-zinc-900">{cbmTotal.toFixed(2)} m³</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">Costo por CBM</p>
            <p className="mt-1 text-sm font-semibold text-zinc-900">{formatoPesos(costoPorCbm)}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">Costo total contenedor</p>
            <p className="mt-1 text-sm font-semibold text-zinc-900">{formatoPesos(costoTotal)}</p>
          </div>
        </div>

        <Historial historial={listaHistorial} />
        <Documentos contenedorId={contenedor.id} documentosPorTipo={documentosPorTipo} />
        <FormularioContenedor contenedor={contenedor} />
        <Abonos contenedorId={contenedor.id} abonos={listaAbonos} />
        <Productos
          contenedorId={contenedor.id}
          productos={listaProductos}
          costoPorCbm={costoPorCbm}
          tipoCambioMercancia={tipoCambioMercancia}
          fabricaPrincipal={contenedor.fabrica_principal}
          proveedorPrincipal={contenedor.proveedor_principal}
          catalogo={catalogo}
        />

        <div className="flex justify-end">
          <Link
            href={`/contenedores/${contenedor.id}/imprimir`}
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
          >
            Ver / imprimir packing list →
          </Link>
        </div>
      </main>
    </div>
  );
}

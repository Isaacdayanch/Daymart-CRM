import { notFound } from "next/navigation";
import { HojaCatalogoVendedores } from "@/components/catalogo-vendedores";
import { BotonImprimir } from "../../../contenedores/[id]/imprimir/boton-imprimir";
import { cargarCatalogoPublico, filtrosDeParams, obtenerAccesoPorToken } from "@/lib/catalogo-vendedores";

export const dynamic = "force-dynamic";

/** "Descargar PDF" del vendedor: la misma hoja que saca Isaac desde Stock. */
export default async function ImprimirCatalogoPublico({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { token } = await params;
  const acceso = await obtenerAccesoPorToken(token);
  if (!acceso) notFound();
  const sp = await searchParams;
  const filtros = filtrosDeParams(sp);
  const { productos } = await cargarCatalogoPublico(filtros);
  const subtitulo = [filtros.categoria && `Categoría: ${filtros.categoria}`, filtros.marca && `Marca: ${filtros.marca}`, filtros.q && `Búsqueda: ${filtros.q}`].filter(Boolean).join(" · ");

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-6 print:hidden sm:px-6">
        <p className="text-xs text-zinc-500">Dale &ldquo;Imprimir&rdquo; y elige &ldquo;Guardar como PDF&rdquo;.</p>
        <BotonImprimir />
      </div>
      <HojaCatalogoVendedores productos={productos} subtitulo={subtitulo || null} />
    </div>
  );
}

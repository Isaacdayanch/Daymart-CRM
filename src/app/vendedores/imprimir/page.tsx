import { createClient } from "@/lib/supabase/server";
import { cargarCatalogoVendedores, filtrosDeParams } from "@/lib/catalogo-vendedores";
import { HojaCatalogoVendedores } from "@/components/catalogo-vendedores";
import { BotonImprimir } from "../../contenedores/[id]/imprimir/boton-imprimir";

/** Catálogo completo imprimible para Isaac (con o sin precios/cantidades).
 * Misma hoja que ven los vendedores, nunca con costos. */
export default async function ImprimirCatalogo({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const filtros = { ...filtrosDeParams(params), soloConPrecio: params.conprecio === "1" };
  const supabase = await createClient();
  const { productos } = await cargarCatalogoVendedores(supabase, filtros);
  const subtitulo = [filtros.categoria && `Categoría: ${filtros.categoria}`, filtros.marca && `Marca: ${filtros.marca}`, !filtros.soloConStock && "incluye agotados"].filter(Boolean).join(" · ");

  return (
    <div className="bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-6 print:hidden sm:px-6">
        <p className="text-xs text-zinc-500">Dale &ldquo;Imprimir&rdquo; y elige &ldquo;Guardar como PDF&rdquo;.</p>
        <BotonImprimir />
      </div>
      <HojaCatalogoVendedores productos={productos} subtitulo={subtitulo || null} vista={{ modo: "vendedor", sinCantidades: params.sin === "1", sinPrecios: params.sinprecios === "1" }} />
    </div>
  );
}

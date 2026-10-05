import { createClient } from "@/lib/supabase/server";
import { cargarCatalogoVendedores, filtrosDeParams } from "@/lib/catalogo-vendedores";
import { HojaCatalogoVendedores } from "@/components/catalogo-vendedores";
import { BotonImprimir } from "../../../contenedores/[id]/imprimir/boton-imprimir";

/** Catálogo completo imprimible (Isaac, desde Stock → Catálogo). Misma hoja
 * que ve el vendedor en "Descargar PDF": sin precios ni costos. */
export default async function ImprimirCatalogo({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const filtros = filtrosDeParams(params);
  const sinCantidades = params.sin === "1";
  const supabase = await createClient();
  const { productos } = await cargarCatalogoVendedores(supabase, filtros);
  const subtitulo = [filtros.categoria && `Categoría: ${filtros.categoria}`, filtros.marca && `Marca: ${filtros.marca}`, !filtros.soloConStock && "incluye agotados"].filter(Boolean).join(" · ");

  return (
    <div className="bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-6 print:hidden sm:px-6">
        <p className="text-xs text-zinc-500">Dale &ldquo;Imprimir&rdquo; y elige &ldquo;Guardar como PDF&rdquo;.</p>
        <BotonImprimir />
      </div>
      <HojaCatalogoVendedores productos={productos} subtitulo={subtitulo || null} sinCantidades={sinCantidades} />
    </div>
  );
}

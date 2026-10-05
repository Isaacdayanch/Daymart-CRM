import { createClient } from "@/lib/supabase/server";
import { cargarCatalogoVendedores } from "@/lib/catalogo-vendedores";
import type { ComisionVendedorProducto, Vendedor } from "@/lib/tipos";
import { TablaPrecios } from "./tabla-precios";
import { FormularioPdfCatalogo } from "./formulario-pdf";

/** Lista de precios (una sola para todos los vendedores) con la
 * rentabilidad de Isaac en vivo, y el catálogo en PDF. Solo dueño. */
export default async function ListaPrecios() {
  const supabase = await createClient();
  const [catalogo, { data: vendedores, error }, { data: especiales }] = await Promise.all([
    cargarCatalogoVendedores(supabase, { soloConStock: false }, { conCosto: true }),
    supabase.from("vendedores").select("*").is("eliminado_en", null).is("revocado_en", null).order("nombre").returns<Vendedor[]>(),
    supabase.from("comisiones_vendedor_producto").select("*").returns<ComisionVendedorProducto[]>(),
  ]);
  const faltaSql = Boolean(error);
  const filas = catalogo.productos
    .map((p) => ({ sku: p.sku, nombre: p.nombre, categoria: p.categoria, imagenUrl: p.imagenUrl, stock: p.stock, costo: p.costo ?? 0, precioVenta: p.precioVenta }))
    // Primero lo que tiene stock (lo que de verdad se puede vender), luego el resto.
    .sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0) || a.nombre.localeCompare(b.nombre, "es"));

  return (
    <div className="space-y-6">
      {faltaSql && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Falta correr el SQL 0044 en Supabase para que exista el módulo de Vendedores.
        </div>
      )}
      <TablaPrecios filas={filas} vendedores={vendedores ?? []} especiales={especiales ?? []} />
      <FormularioPdfCatalogo categorias={catalogo.categorias} marcas={catalogo.marcas.map((m) => m.nombre)} />
    </div>
  );
}

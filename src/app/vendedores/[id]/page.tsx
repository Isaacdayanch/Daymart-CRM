import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { baseUrlActual } from "@/lib/base-url";
import { cargarCatalogoVendedores } from "@/lib/catalogo-vendedores";
import type { ComisionVendedorProducto, Vendedor } from "@/lib/tipos";
import { FichaVendedor } from "./ficha-vendedor";
import { ComisionesEspeciales } from "./comisiones-especiales";

/** Ficha de un vendedor: datos y comisión, sus dos links, comisiones
 * especiales por producto, y cortar/reactivar/quitar. */
export default async function FichaVendedorPagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: vendedor }, { data: especiales }, catalogo, baseUrl] = await Promise.all([
    supabase.from("vendedores").select("*").eq("id", id).is("eliminado_en", null).maybeSingle<Vendedor>(),
    supabase.from("comisiones_vendedor_producto").select("*").eq("vendedor_id", id).returns<ComisionVendedorProducto[]>(),
    cargarCatalogoVendedores(await createClient(), { soloConStock: false }),
    baseUrlActual(),
  ]);
  if (!vendedor) notFound();

  return (
    <div className="space-y-6">
      <Link href="/vendedores" className="text-xs text-zinc-500 hover:text-zinc-900">
        ← Todos los vendedores
      </Link>
      <FichaVendedor vendedor={vendedor} baseUrl={baseUrl} categorias={catalogo.categorias} />
      <ComisionesEspeciales
        vendedor={vendedor}
        especiales={especiales ?? []}
        productos={catalogo.productos.map((p) => ({ sku: p.sku, nombre: p.nombre, stockActual: p.stock, imagenUrl: p.imagenUrl, precioVenta: p.precioVenta }))}
      />
    </div>
  );
}

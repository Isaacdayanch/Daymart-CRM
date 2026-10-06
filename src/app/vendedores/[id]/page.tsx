import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { baseUrlActual } from "@/lib/base-url";
import { cargarCatalogoVendedores } from "@/lib/catalogo-vendedores";
import type { ComisionVendedorProducto, PrecioVendedor, Vendedor } from "@/lib/tipos";
import { formatoPesos } from "@/lib/formato";
import { FichaVendedor } from "./ficha-vendedor";
import { ComisionesEspeciales } from "./comisiones-especiales";

/** Ficha de un vendedor: datos y comisión, sus dos links, comisiones
 * especiales por producto, y cortar/reactivar/quitar. */
export default async function FichaVendedorPagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: vendedor }, { data: especiales }, { data: preciosPropios }, catalogo, baseUrl] = await Promise.all([
    supabase.from("vendedores").select("*").eq("id", id).is("eliminado_en", null).maybeSingle<Vendedor>(),
    supabase.from("comisiones_vendedor_producto").select("*").eq("vendedor_id", id).returns<ComisionVendedorProducto[]>(),
    supabase.from("precios_vendedor").select("*").eq("vendedor_id", id).returns<PrecioVendedor[]>(),
    cargarCatalogoVendedores(await createClient(), { soloConStock: false }),
    baseUrlActual(),
  ]);
  if (!vendedor) notFound();
  const porSku = new Map(catalogo.productos.map((p) => [p.sku, p]));
  const subidos = (preciosPropios ?? []).filter((x) => {
    const p = porSku.get(x.sku);
    return p?.precioVenta && Number(x.precio) > p.precioVenta;
  });

  return (
    <div className="space-y-6">
      <Link href="/vendedores" className="text-xs text-zinc-500 hover:text-zinc-900">
        ← Todos los vendedores
      </Link>
      <FichaVendedor vendedor={vendedor} baseUrl={baseUrl} categorias={catalogo.categorias} />
      {subidos.length > 0 && (
        <details className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-900">Precios que subió el vendedor ({subidos.length})</summary>
          <p className="mt-1 text-xs text-zinc-500">Por encima de tu mínimo autorizado. El sobreprecio es del vendedor; tu rentabilidad se calcula sobre el mínimo.</p>
          <ul className="mt-2 divide-y divide-zinc-100 text-sm">
            {subidos.map((x) => {
              const p = porSku.get(x.sku)!;
              return (
                <li key={x.sku} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-zinc-800">{p.nombre}</span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    mínimo {formatoPesos(p.precioVenta!)} → <span className="font-semibold text-zinc-900">{formatoPesos(Number(x.precio))}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
      <ComisionesEspeciales
        vendedor={vendedor}
        especiales={especiales ?? []}
        productos={catalogo.productos.map((p) => ({ sku: p.sku, nombre: p.nombre, stockActual: p.stock, imagenUrl: p.imagenUrl, precioVenta: p.precioVenta }))}
      />
    </div>
  );
}

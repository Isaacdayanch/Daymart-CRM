import { createClient } from "@/lib/supabase/server";
import { todosLosMovimientosStock } from "@/lib/cargar-todo";
import { resumenPorSku } from "@/lib/calculos-stock";
import { obtenerCatalogo, obtenerMarcas, skusExistentes } from "@/lib/catalogo";
import { obtenerSugerenciasCatalogo } from "@/lib/catalogo-proveedores";
import { obtenerPiezasPorCajaPorSku } from "@/lib/productos-stock";
import { cargarOrdenes } from "@/lib/compras";
import type { Bodega, ConfiguracionStock } from "@/lib/tipos";
import { FormularioOrden } from "../formulario-orden";
import { cargarOpcionesOrden, preciosAnteriores } from "../datos-orden";

export default async function NuevaOrden({ searchParams }: { searchParams: Promise<{ proveedor?: string }> }) {
  const { proveedor } = await searchParams;
  const supabase = await createClient();
  const [{ data: movimientos }, { data: configuracion }, piezasPorCajaPorSku, catalogo, marcas, sugerencias, { data: bodegas }, skus, { ordenes, proveedores, error }] = await Promise.all([
    todosLosMovimientosStock(supabase),
    supabase.from("configuracion_stock").select("*").maybeSingle<ConfiguracionStock>(),
    obtenerPiezasPorCajaPorSku(supabase),
    obtenerCatalogo(supabase).catch(() => []),
    obtenerMarcas(supabase).catch(() => []),
    obtenerSugerenciasCatalogo(supabase).catch(() => ({ categorias: [] as string[] })),
    supabase.from("bodegas").select("*").is("eliminado_en", null).order("nombre").returns<Bodega[]>(),
    skusExistentes(supabase).catch(() => new Set<string>()),
    cargarOrdenes(supabase),
  ]);
  const resumenes = resumenPorSku(movimientos ?? [], configuracion?.dias_espera ?? 60, piezasPorCajaPorSku);
  const { ultimosPrecios, ultimoPrecioGlobal } = preciosAnteriores(ordenes);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-zinc-900">Nueva orden de compra</h2>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      <FormularioOrden
        proveedores={proveedores}
        bodegas={bodegas ?? []}
        opciones={cargarOpcionesOrden(catalogo, resumenes)}
        marcas={marcas.map((m) => ({ id: m.id, nombre: m.nombre, codigo: m.codigo }))}
        categorias={sugerencias.categorias}
        skusExistentes={Array.from(skus)}
        ultimosPrecios={ultimosPrecios}
        ultimoPrecioGlobal={ultimoPrecioGlobal}
        proveedorInicial={proveedor ?? null}
      />
    </div>
  );
}

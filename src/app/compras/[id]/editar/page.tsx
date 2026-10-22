import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todosLosMovimientosStock } from "@/lib/cargar-todo";
import { resumenPorSku } from "@/lib/calculos-stock";
import { obtenerCatalogo, obtenerMarcas, skusExistentes } from "@/lib/catalogo";
import { obtenerSugerenciasCatalogo } from "@/lib/catalogo-proveedores";
import { obtenerPiezasPorCajaPorSku } from "@/lib/productos-stock";
import { cargarOrdenes } from "@/lib/compras";
import type { Bodega, ConfiguracionStock } from "@/lib/tipos";
import { FormularioOrden } from "../../formulario-orden";
import { cargarOpcionesOrden, preciosAnteriores } from "../../datos-orden";

export default async function EditarOrden({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: movimientos }, { data: configuracion }, piezasPorCajaPorSku, catalogo, marcas, sugerencias, { data: bodegas }, skus, { ordenes, proveedores }] = await Promise.all([
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
  const datos = ordenes.find((o) => o.orden.id === id);
  if (!datos) notFound();
  const editable = datos.orden.estado === "PEDIDA" && datos.lineas.every((l) => l.cantidad_recibida <= 0);
  const resumenes = resumenPorSku(movimientos ?? [], configuracion?.dias_espera ?? 60, piezasPorCajaPorSku);
  const { ultimosPrecios, ultimoPrecioGlobal } = preciosAnteriores(ordenes.filter((o) => o.orden.id !== id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Editar orden #{datos.orden.numero}</h2>
        <Link href={`/compras/${id}`} className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Volver a la orden
        </Link>
      </div>
      {!editable ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Esta orden ya recibió mercancía o está cerrada: ya no se edita. Si algo está mal, cancélala y captúrala de nuevo.</div>
      ) : (
        <FormularioOrden
          proveedores={proveedores}
          bodegas={bodegas ?? []}
          opciones={cargarOpcionesOrden(catalogo, resumenes)}
          marcas={marcas.map((m) => ({ id: m.id, nombre: m.nombre, codigo: m.codigo }))}
          categorias={sugerencias.categorias}
          skusExistentes={Array.from(skus)}
          ultimosPrecios={ultimosPrecios}
          ultimoPrecioGlobal={ultimoPrecioGlobal}
          inicial={{ orden: datos.orden, lineas: datos.lineas }}
        />
      )}
    </div>
  );
}

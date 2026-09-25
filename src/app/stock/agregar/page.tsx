import { createClient } from "@/lib/supabase/server";
import { obtenerCatalogo, obtenerMarcas } from "@/lib/catalogo";
import { obtenerSugerenciasCatalogo } from "@/lib/catalogo-proveedores";
import { resumenPorSku } from "@/lib/calculos-stock";
import { registradoEnSistema } from "@/lib/calculos-historico";
import { obtenerPiezasPorCajaPorSku } from "@/lib/productos-stock";
import type { Bodega, ConfiguracionStock, MovimientoStock } from "@/lib/tipos";
import { FormularioProductoStock, type ProductoExistente } from "./formulario-producto-stock";

/** Agregar producto a Stock (Fase B): alta con marca/categoría/SKU y stock
 * inicial con histórico, o entrada suelta a un producto que ya existe. */
export default async function AgregarProductoStock() {
  const supabase = await createClient();
  const [{ data: bodegas }, marcas, catalogo, sugerencias, { data: movimientos }, { data: configuracion }, piezasPorCajaPorSku] = await Promise.all([
    supabase.from("bodegas").select("*").is("eliminado_en", null).order("nombre").returns<Bodega[]>(),
    obtenerMarcas(supabase).catch(() => []),
    obtenerCatalogo(supabase).catch(() => []),
    obtenerSugerenciasCatalogo(supabase),
    supabase.from("movimientos_stock").select("*").returns<MovimientoStock[]>(),
    supabase.from("configuracion_stock").select("*").single<ConfiguracionStock>(),
    obtenerPiezasPorCajaPorSku(supabase),
  ]);
  const resumenes = resumenPorSku(movimientos ?? [], configuracion?.dias_espera ?? 60, piezasPorCajaPorSku);
  const stockPorSku = new Map(resumenes.map((r) => [r.sku, r]));
  const movimientosPorSku = new Map<string, MovimientoStock[]>();
  for (const m of movimientos ?? []) movimientosPorSku.set(m.sku, [...(movimientosPorSku.get(m.sku) ?? []), m]);
  const fichaPorSku = new Map(catalogo.map((p) => [p.sku, p]));

  // Productos que ya existen: los del catálogo + los que solo viven en stock.
  const skus = new Set([...catalogo.map((p) => p.sku), ...resumenes.map((r) => r.sku)]);
  const existentes: ProductoExistente[] = Array.from(skus)
    .map((sku) => {
      const ficha = fichaPorSku.get(sku);
      const r = stockPorSku.get(sku);
      const registrado = registradoEnSistema(movimientosPorSku.get(sku) ?? []);
      return {
        sku,
        nombre: ficha?.nombre ?? r?.nombre ?? sku,
        stockActual: r?.stockActual ?? 0,
        entradasSistema: registrado.entradas,
        salidasSistema: registrado.salidas,
        imagenUrl: ficha?.imagen_url ?? r?.imagenUrl ?? null,
        marcaId: ficha?.marca_id ?? null,
        categoria: ficha?.categoria ?? null,
        piezasPorCaja: ficha?.piezas_por_caja ?? r?.piezasPorCaja ?? 1,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const categorias = Array.from(new Set([...sugerencias.categorias, ...catalogo.map((p) => p.categoria).filter((c): c is string => Boolean(c))])).sort();

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-zinc-500">
        Da de alta un producto que no vino en un contenedor del sistema (o agrégale stock a uno que ya existe). Si es mercancía de antes de usar el sistema,
        captura su histórico: cuántas piezas han entrado y salido en total, y el stock queda en lo que de verdad hay.
      </p>
      <FormularioProductoStock bodegas={bodegas ?? []} marcas={marcas} categorias={categorias} existentes={existentes} />
    </div>
  );
}

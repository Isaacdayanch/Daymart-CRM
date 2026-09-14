import { createClient } from "@/lib/supabase/server";
import type { Bodega, Producto } from "@/lib/tipos";
import { FormularioStockManual } from "./formulario-stock-manual";

export default async function AgregarStockManual() {
  const supabase = await createClient();
  const [{ data: bodegas }, { data: catalogoCrudo }] = await Promise.all([
    supabase.from("bodegas").select("*").is("eliminado_en", null).order("nombre").returns<Bodega[]>(),
    supabase.from("productos").select("*").order("creado_en", { ascending: false }).returns<Producto[]>(),
  ]);

  const catalogoPorSku = new Map<string, Producto>();
  for (const p of catalogoCrudo ?? []) {
    if (!catalogoPorSku.has(p.sku)) catalogoPorSku.set(p.sku, p);
  }
  const catalogo = Array.from(catalogoPorSku.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-zinc-500">
        Para cualquier mercancía que entra a bodega SIN pasar por un contenedor: si compras algo aquí en
        México, pones el costo directo en pesos. También sirve para cargar de una vez el inventario que ya
        tenías (ej. contenedores anteriores al 10 que no vas a recrear completos en el sistema). Si el SKU
        ya existe, se suma a lo que ya había.
      </p>
      <FormularioStockManual bodegas={bodegas ?? []} catalogo={catalogo} />
    </div>
  );
}

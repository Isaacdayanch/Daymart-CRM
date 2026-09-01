import { createClient } from "@/lib/supabase/server";
import type { Bodega, Producto } from "@/lib/tipos";
import { FormularioCargaMasiva } from "./formulario-carga-masiva";

export default async function CargaMasivaStock() {
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
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-zinc-500">
        Para cargar de un jalón el inventario que ya tienes hoy (por ejemplo, de tu Excel), sin recrear
        contenedores ni su historial. Usa el SKU que quieras a partir de ahora — no necesita coincidir con
        ninguno anterior. Cada línea entra como stock de hoy.
      </p>
      <FormularioCargaMasiva bodegas={bodegas ?? []} catalogo={catalogo} />
    </div>
  );
}

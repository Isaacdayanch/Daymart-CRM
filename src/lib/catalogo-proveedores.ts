import type { createClient } from "./supabase/server";

/** Junta las fábricas/proveedores/categorías que Isaac ya ha usado (a
 * nivel contenedor y a nivel producto), para sugerirlas al capturar algo
 * nuevo — normalmente se repiten mucho entre contenedores. */
export async function obtenerSugerenciasCatalogo(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [{ data: contenedores }, { data: productos }] = await Promise.all([
    supabase.from("contenedores").select("fabrica_principal, proveedor_principal"),
    supabase.from("productos").select("fabrica, proveedor, categoria"),
  ]);

  const fabricas = new Set<string>();
  const proveedores = new Set<string>();
  const categorias = new Set<string>();

  for (const c of contenedores ?? []) {
    if (c.fabrica_principal) fabricas.add(c.fabrica_principal);
    if (c.proveedor_principal) proveedores.add(c.proveedor_principal);
  }
  for (const p of productos ?? []) {
    if (p.fabrica) fabricas.add(p.fabrica);
    if (p.proveedor) proveedores.add(p.proveedor);
    if (p.categoria) categorias.add(p.categoria);
  }

  return {
    fabricas: Array.from(fabricas).sort((a, b) => a.localeCompare(b)),
    proveedores: Array.from(proveedores).sort((a, b) => a.localeCompare(b)),
    categorias: Array.from(categorias).sort((a, b) => a.localeCompare(b)),
  };
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { obtenerCatalogo } from "@/lib/catalogo";
import { codigosMlPorSku, resolverCodigoMl, type ProductoEtiqueta } from "@/lib/etiquetas";
import { etiquetaMancuerna } from "@/lib/mancuernas";
import type { Contenedor, Producto } from "@/lib/tipos";
import { HojaEtiquetas } from "./hoja-etiquetas";

export const maxDuration = 60;

/** Etiquetas de producto (SKU + nombre + código de barras del Código ML de
 * Full). `?contenedor=<id>` preselecciona los productos de ese contenedor con
 * su cantidad; `?sku=<sku>` preselecciona ese producto. */
export default async function EtiquetasPage({ searchParams }: { searchParams: Promise<{ contenedor?: string; sku?: string }> }) {
  const { contenedor: contenedorId, sku: skuInicial } = await searchParams;
  const supabase = await createClient();

  const [catalogo, { data: contenedor }, { data: productosContenedor }] = await Promise.all([
    obtenerCatalogo(supabase),
    contenedorId ? supabase.from("contenedores").select("id, numero").eq("id", contenedorId).maybeSingle<Pick<Contenedor, "id" | "numero">>() : Promise.resolve({ data: null }),
    contenedorId ? supabase.from("productos").select("*").eq("contenedor_id", contenedorId).order("orden").returns<Producto[]>() : Promise.resolve({ data: [] as Producto[] }),
  ]);

  const delContenedor = productosContenedor ?? [];
  const skus = new Set<string>([...catalogo.map((c) => c.sku), ...delContenedor.map((p) => p.sku)]);
  const codigosMl = await codigosMlPorSku(skus);
  const catalogoPorSku = new Map(catalogo.map((c) => [c.sku, c]));
  const productoPorSku = new Map(delContenedor.map((p) => [p.sku, p]));

  const lista: ProductoEtiqueta[] = [];
  for (const sku of skus) {
    const ficha = catalogoPorSku.get(sku);
    const prod = productoPorSku.get(sku);
    const { codigoMl, origenCodigo, otrosCodigosMl } = resolverCodigoMl(prod?.codigo_ml, ficha?.codigo_ml, codigosMl.get(sku));
    lista.push({
      sku,
      nombre: prod?.nombre ?? ficha?.nombre ?? sku,
      imagenUrl: prod?.imagen_url ?? ficha?.imagen_url ?? null,
      codigoMl,
      origenCodigo,
      otrosCodigosMl,
      detalle: etiquetaMancuerna(prod ?? ficha),
      copiasPropuestas: prod ? Math.max(1, prod.cantidad) : 1,
    });
  }
  // Los del contenedor primero (en su orden), luego el resto por nombre.
  const ordenContenedor = new Map(delContenedor.map((p, i) => [p.sku, i]));
  lista.sort((a, b) => {
    const ia = ordenContenedor.get(a.sku);
    const ib = ordenContenedor.get(b.sku);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return a.nombre.localeCompare(b.nombre, "es");
  });

  const seleccionInicial: Record<string, number> = {};
  for (const p of delContenedor) seleccionInicial[p.sku] = Math.max(1, p.cantidad);
  if (skuInicial && skus.has(skuInicial)) seleccionInicial[skuInicial] = 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Etiquetas de producto</h2>
          <p className="text-sm text-zinc-500">
            SKU + nombre + código de barras del <strong>Código ML de Full</strong> (el que Mercado Libre escanea al recibir). Si el producto está ligado a Mercado Libre, el código se toma solo; si no, pónselo aquí o al capturar el producto en el contenedor. Sin código, la etiqueta sale solo con SKU y nombre.
          </p>
        </div>
        {contenedor && (
          <Link href={`/contenedores/${contenedor.id}`} className="text-sm text-zinc-500 hover:text-zinc-900">
            ← Contenedor {contenedor.numero}
          </Link>
        )}
      </div>
      <HojaEtiquetas productos={lista} seleccionInicial={seleccionInicial} titulo={contenedor ? `Productos del contenedor ${contenedor.numero} (y el resto del catálogo abajo)` : null} />
    </div>
  );
}

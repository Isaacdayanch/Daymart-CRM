import type { ResumenSku } from "@/lib/calculos-stock";
import type { OrdenConDatos } from "@/lib/compras";
import type { ProductoCatalogo } from "@/lib/tipos";
import type { OpcionProducto } from "./formulario-orden";

/** Productos que se pueden pedir: todo el catálogo (tenga o no stock) más
 * los SKUs que solo viven en movimientos, con su stock de hoy y su foto. */
export function cargarOpcionesOrden(catalogo: ProductoCatalogo[], resumenes: ResumenSku[]): OpcionProducto[] {
  const porSku = new Map<string, OpcionProducto>();
  for (const p of catalogo) porSku.set(p.sku, { sku: p.sku, nombre: p.nombre, stockActual: 0, piezasPorCaja: p.piezas_por_caja || 1, imagenUrl: p.imagen_url });
  for (const r of resumenes) {
    const previo = porSku.get(r.sku);
    porSku.set(r.sku, { sku: r.sku, nombre: previo?.nombre ?? r.nombre, stockActual: r.stockActual, piezasPorCaja: previo?.piezasPorCaja ?? r.piezasPorCaja, imagenUrl: previo?.imagenUrl ?? r.imagenUrl });
  }
  return Array.from(porSku.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Último precio al que se compró cada SKU, por proveedor y en general
 * ("como la última vez"). Las órdenes vienen de la más nueva a la más vieja. */
export function preciosAnteriores(ordenes: OrdenConDatos[]) {
  const ultimosPrecios: Record<string, Record<string, number>> = {};
  const ultimoPrecioGlobal: Record<string, number> = {};
  for (const o of ordenes) {
    if (o.orden.estado === "CANCELADA") continue;
    const deProveedor = (ultimosPrecios[o.orden.proveedor_id] ??= {});
    for (const l of o.lineas) {
      if (!(l.sku in deProveedor)) deProveedor[l.sku] = l.precio_unitario;
      if (!(l.sku in ultimoPrecioGlobal)) ultimoPrecioGlobal[l.sku] = l.precio_unitario;
    }
  }
  return { ultimosPrecios, ultimoPrecioGlobal };
}

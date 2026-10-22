// Carga compartida del módulo de Compras: cada orden con sus líneas, su
// proveedor, su cuenta por pagar (Finanzas → Facturas) y los pagos, con los
// totales ya calculados. La usan la lista, Por recibir, Proveedores y los
// avisos, para que todas digan lo mismo.

import type { SupabaseClient } from "@supabase/supabase-js";
import { montoRecibido, piezasPedidas, piezasRecibidas, totalOrden } from "./calculos-compras";
import type { FacturaPendiente, OrdenCompra, OrdenCompraLinea, PagoFactura, ProveedorMx } from "./tipos";

export interface OrdenConDatos {
  orden: OrdenCompra;
  lineas: OrdenCompraLinea[];
  proveedor: ProveedorMx | null;
  factura: FacturaPendiente | null;
  pagos: PagoFactura[];
  /** Total pedido (mercancía + flete). */
  total: number;
  /** Lo que vale lo que ya llegó (+ flete). */
  recibido: number;
  pagado: number;
  /** Lo que falta pagar de su cuenta por pagar (0 si no tiene). */
  saldo: number;
  piezas: number;
  piezasRecibidas: number;
}

export async function cargarOrdenes(supabase: SupabaseClient): Promise<{ ordenes: OrdenConDatos[]; proveedores: ProveedorMx[]; error: string | null }> {
  const [{ data: ordenes, error }, { data: lineas }, { data: proveedores }, { data: facturas }] = await Promise.all([
    supabase.from("ordenes_compra").select("*").order("numero", { ascending: false }).returns<OrdenCompra[]>(),
    supabase.from("orden_compra_lineas").select("*").order("orden").returns<OrdenCompraLinea[]>(),
    supabase.from("proveedores_mx").select("*").order("nombre").returns<ProveedorMx[]>(),
    supabase.from("facturas_pendientes").select("*").not("orden_compra_id", "is", null).returns<FacturaPendiente[]>(),
  ]);
  if (error) {
    const falta = /does not exist|schema cache/i.test(error.message);
    return { ordenes: [], proveedores: [], error: falta ? "Falta correr el SQL 0055 en Supabase para activar Compras." : error.message };
  }
  const idsFacturas = (facturas ?? []).map((f) => f.id);
  const { data: pagos } = idsFacturas.length ? await supabase.from("pagos_factura").select("*").in("factura_id", idsFacturas).returns<PagoFactura[]>() : { data: [] as PagoFactura[] };

  const lista = (ordenes ?? []).map((orden) => {
    const suyas = (lineas ?? []).filter((l) => l.orden_id === orden.id);
    const factura = (facturas ?? []).find((f) => f.orden_compra_id === orden.id) ?? null;
    const suyos = factura ? (pagos ?? []).filter((p) => p.factura_id === factura.id) : [];
    const pagado = suyos.reduce((s, p) => s + p.monto, 0);
    return {
      orden,
      lineas: suyas,
      proveedor: (proveedores ?? []).find((p) => p.id === orden.proveedor_id) ?? null,
      factura,
      pagos: suyos,
      total: totalOrden(orden, suyas),
      recibido: montoRecibido(orden, suyas),
      pagado,
      saldo: factura ? Math.max(0, factura.monto - pagado) : 0,
      piezas: piezasPedidas(suyas),
      piezasRecibidas: piezasRecibidas(suyas),
    };
  });
  return { ordenes: lista, proveedores: (proveedores ?? []).filter((p) => !p.eliminado_en), error: null };
}

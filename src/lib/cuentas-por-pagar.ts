// Cuentas por pagar agrupadas por proveedor (Isaac, 4 nov: "agrega todo lo
// que se debe en Proveedores, ya que a fin de cuentas son proveedores").
//
// Finanzas → Proveedores llevaba solo la deuda con proveedores de China
// (`movimientos_deuda_proveedor`). Lo que se debe a proveedores de México
// vive en `facturas_pendientes` (cada orden de compra genera una, y las
// facturas sueltas de servicios también). Aquí se agrupan por proveedor
// SOLO para verlas juntas: el pago sigue registrándose desde la orden o en
// Finanzas → Facturas, nunca con "Pagar a cuenta" (eso abonaría a la deuda
// de China y la factura seguiría abierta).

import type { FacturaPendiente, Moneda, PagoFactura } from "./tipos";
import { saldoFactura } from "./calculos-facturas";

export interface CuentaPorPagar {
  facturaId: string;
  folio: string | null;
  concepto: string | null;
  saldo: number;
  moneda: Moneda;
  fechaLimite: string | null;
  ordenCompraId: string | null;
}

export interface ProveedorConCuentas {
  proveedor: string;
  saldoMxn: number;
  saldoUsd: number;
  cuentas: CuentaPorPagar[];
  /** Fecha límite más próxima entre sus cuentas con saldo (null si ninguna la tiene). */
  proximoVencimiento: string | null;
}

function clave(nombre: string | null | undefined) {
  return (nombre ?? "").trim().toLowerCase();
}

/** Un renglón por proveedor con saldo > 0, del que más debe al que menos
 * (pesos primero, luego dólares). Las cuentas de cada proveedor van de la
 * fecha límite más próxima a la más lejana (sin fecha al final). */
export function cuentasPorPagarPorProveedor(facturas: FacturaPendiente[], pagos: PagoFactura[]): ProveedorConCuentas[] {
  const mapa = new Map<string, ProveedorConCuentas>();
  for (const f of facturas) {
    const { saldo } = saldoFactura(f, pagos);
    if (saldo <= 0.01) continue;
    const k = clave(f.proveedor);
    if (!k) continue;
    const actual = mapa.get(k) ?? { proveedor: f.proveedor.trim(), saldoMxn: 0, saldoUsd: 0, cuentas: [], proximoVencimiento: null };
    if (f.moneda === "USD") actual.saldoUsd += saldo;
    else actual.saldoMxn += saldo;
    actual.cuentas.push({
      facturaId: f.id,
      folio: f.folio,
      concepto: f.concepto,
      saldo,
      moneda: f.moneda,
      fechaLimite: f.fecha_limite ? f.fecha_limite.slice(0, 10) : null,
      ordenCompraId: f.orden_compra_id ?? null,
    });
    mapa.set(k, actual);
  }
  const lista = [...mapa.values()];
  for (const p of lista) {
    p.cuentas.sort((a, b) => {
      if (a.fechaLimite && b.fechaLimite) return a.fechaLimite < b.fechaLimite ? -1 : a.fechaLimite > b.fechaLimite ? 1 : 0;
      if (a.fechaLimite) return -1;
      if (b.fechaLimite) return 1;
      return b.saldo - a.saldo;
    });
    p.proximoVencimiento = p.cuentas.find((c) => c.fechaLimite)?.fechaLimite ?? null;
  }
  lista.sort((a, b) => b.saldoMxn - a.saldoMxn || b.saldoUsd - a.saldoUsd || a.proveedor.localeCompare(b.proveedor, "es"));
  return lista;
}

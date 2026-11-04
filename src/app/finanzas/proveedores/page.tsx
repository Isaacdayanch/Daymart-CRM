import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatoPesos, formatoDolares, formatoFecha } from "@/lib/formato";
import { cargosAbiertosProveedor, proveedoresConDeuda, saldoProveedor } from "@/lib/calculos-socios-deuda";
import { cuentasPorPagarPorProveedor } from "@/lib/cuentas-por-pagar";
import type { Contenedor, CuentaFinanciera, FacturaPendiente, MovimientoDeudaProveedor, PagoFactura } from "@/lib/tipos";
import { FormularioProveedor } from "./formulario-proveedor";
import { EnvioPuente } from "./envio-puente";
import { FilaHistorial } from "./fila-historial";
import { ultimosPagosPorProveedor } from "@/lib/ultimos-pagos";

export default async function ProveedoresFinanzas() {
  const supabase = await createClient();
  const [{ data: movimientos }, { data: cuentas }, { data: contenedores }, { data: abonosPendientes }, { data: ligas }, ultimos, { data: facturas }, { data: pagosFactura }, { data: ordenesCompra }] =
    await Promise.all([
      supabase.from("movimientos_deuda_proveedor").select("*").returns<MovimientoDeudaProveedor[]>(),
      supabase.from("cuentas_financieras").select("*").is("eliminado_en", null).returns<CuentaFinanciera[]>(),
      supabase
        .from("contenedores")
        .select("*")
        .is("eliminado_en", null)
        .order("numero", { ascending: false })
        .returns<Contenedor[]>(),
      supabase
        .from("pagos_mercancia")
        .select("id, contenedor_id, monto_dolares, fecha_limite")
        .eq("pagado", false)
        .returns<{ id: string; contenedor_id: string; monto_dolares: number; fecha_limite: string | null }[]>(),
      // Para saber qué movimientos de deuda vienen de un contenedor (se
      // corrigen desde ahí, no aquí).
      supabase
        .from("pagos_mercancia")
        .select("cargo_deuda_id, movimiento_financiero_id")
        .returns<{ cargo_deuda_id: string | null; movimiento_financiero_id: string | null }[]>(),
      ultimosPagosPorProveedor(supabase),
      // Cuentas por pagar (Facturas): proveedores de México y servicios. Se
      // muestran aquí solo para ver TODO lo que se debe junto; se pagan desde
      // la orden de compra o en Finanzas → Facturas.
      supabase.from("facturas_pendientes").select("*").returns<FacturaPendiente[]>(),
      supabase.from("pagos_factura").select("id, factura_id, monto").returns<PagoFactura[]>(),
      supabase.from("ordenes_compra").select("id, numero").returns<{ id: string; numero: number }[]>(),
    ]);
  const cargosLigados = new Set((ligas ?? []).map((l) => l.cargo_deuda_id).filter(Boolean));
  const movsLigados = new Set((ligas ?? []).map((l) => l.movimiento_financiero_id).filter(Boolean));
  const estaLigado = (m: MovimientoDeudaProveedor) => cargosLigados.has(m.id) || (m.movimiento_financiero_id !== null && movsLigados.has(m.movimiento_financiero_id));

  const listaMovimientos = movimientos ?? [];
  const listaCuentas = cuentas ?? [];
  const nombresProveedores = proveedoresConDeuda(listaMovimientos);
  const historial = [...listaMovimientos].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  const cuentasPorPagar = cuentasPorPagarPorProveedor(facturas ?? [], pagosFactura ?? []);
  const numeroOrden = (id: string | null) => (id ? (ordenesCompra ?? []).find((o) => o.id === id)?.numero ?? null : null);
  const totalCxpMxn = cuentasPorPagar.reduce((s, p) => s + p.saldoMxn, 0);
  const totalCxpUsd = cuentasPorPagar.reduce((s, p) => s + p.saldoUsd, 0);

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-500">
        Todo lo que debes a proveedores en un solo lugar. Arriba, la deuda con proveedores de China (se lleva por
        proveedor en general, no por contenedor, igual que abonas &ldquo;a cuenta&rdquo;; cada cargo puede traer su
        propia fecha límite y los abonos se aplican al cargo más viejo primero). Abajo, lo que debes a proveedores de
        México y servicios por órdenes de compra y facturas.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {nombresProveedores.length === 0 ? (
          <p className="text-sm text-zinc-500 sm:col-span-2">Todavía no tienes deuda registrada con ningún proveedor.</p>
        ) : (
          nombresProveedores.map((proveedor) => {
            const usd = saldoProveedor(listaMovimientos, proveedor, "USD");
            const mxn = saldoProveedor(listaMovimientos, proveedor, "MXN");
            if (usd === 0 && mxn === 0) return null;
            const abiertosUsd = cargosAbiertosProveedor(listaMovimientos, proveedor, "USD");
            const abiertosMxn = cargosAbiertosProveedor(listaMovimientos, proveedor, "MXN");
            const conVencimiento = [...abiertosUsd, ...abiertosMxn].filter((a) => a.cargo.fecha_limite);
            return (
              <div key={proveedor} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-zinc-900">{proveedor}</p>
                <div className="mt-2 flex gap-4 text-sm">
                  {usd !== 0 && (
                    <p className="text-zinc-600">
                      Debes: <span className="font-medium text-zinc-900">{formatoDolares(usd)}</span>
                    </p>
                  )}
                  {mxn !== 0 && (
                    <p className="text-zinc-600">
                      Debes: <span className="font-medium text-zinc-900">{formatoPesos(mxn)}</span>
                    </p>
                  )}
                </div>
                {conVencimiento.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-zinc-100 pt-2">
                    {conVencimiento.map(({ cargo, pendiente }) => (
                      <p key={cargo.id} className="text-xs text-zinc-400">
                        {cargo.moneda === "USD" ? formatoDolares(pendiente) : formatoPesos(pendiente)} vence{" "}
                        {formatoFecha(cargo.fecha_limite!)}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Proveedores de México y servicios (cuentas por pagar)</h2>
            <p className="text-xs text-zinc-500">
              Lo que debes por órdenes de compra y facturas. Se paga desde la orden o en{" "}
              <Link href="/finanzas/facturas" className="text-[#2D3277] hover:underline">
                Finanzas → Facturas
              </Link>
              , no con &ldquo;Pagar a cuenta&rdquo; de abajo (eso es para la deuda de China).
            </p>
          </div>
          {cuentasPorPagar.length > 0 && (
            <p className="text-sm text-zinc-600">
              Total: <span className="font-semibold text-zinc-900">{formatoPesos(totalCxpMxn)}</span>
              {totalCxpUsd > 0 && (
                <>
                  {" "}
                  + <span className="font-semibold text-zinc-900">{formatoDolares(totalCxpUsd)}</span>
                </>
              )}
            </p>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {cuentasPorPagar.length === 0 ? (
            <p className="text-sm text-zinc-500 sm:col-span-2">No debes nada por órdenes de compra ni facturas.</p>
          ) : (
            cuentasPorPagar.map((p) => (
              <div key={p.proveedor} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-900">{p.proveedor}</p>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500">
                    {p.cuentas.every((c) => c.ordenCompraId) ? "órdenes de compra" : p.cuentas.some((c) => c.ordenCompraId) ? "órdenes y facturas" : "facturas"}
                  </span>
                </div>
                <div className="mt-2 flex gap-4 text-sm">
                  {p.saldoMxn > 0 && (
                    <p className="text-zinc-600">
                      Debes: <span className="font-medium text-zinc-900">{formatoPesos(p.saldoMxn)}</span>
                    </p>
                  )}
                  {p.saldoUsd > 0 && (
                    <p className="text-zinc-600">
                      Debes: <span className="font-medium text-zinc-900">{formatoDolares(p.saldoUsd)}</span>
                    </p>
                  )}
                </div>
                <div className="mt-2 space-y-1 border-t border-zinc-100 pt-2">
                  {p.cuentas.map((c) => {
                    const monto = c.moneda === "USD" ? formatoDolares(c.saldo) : formatoPesos(c.saldo);
                    const numero = numeroOrden(c.ordenCompraId);
                    const etiqueta = c.ordenCompraId ? `Orden de compra${numero ? ` #${numero}` : ""}` : c.folio ? `Factura ${c.folio}` : (c.concepto ?? "Factura sin folio");
                    return (
                      <p key={c.facturaId} className="flex flex-wrap justify-between gap-x-3 text-xs text-zinc-500">
                        <span>
                          {c.ordenCompraId ? (
                            <Link href={`/compras/${c.ordenCompraId}`} className="text-[#2D3277] hover:underline">
                              {etiqueta} →
                            </Link>
                          ) : (
                            <Link href="/finanzas/facturas" className="text-[#2D3277] hover:underline">
                              {etiqueta} →
                            </Link>
                          )}
                        </span>
                        <span className="tabular-nums">
                          {monto}
                          {c.fechaLimite ? ` · vence ${formatoFecha(c.fechaLimite)}` : ""}
                        </span>
                      </p>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="border-t border-zinc-200 pt-6">
        <h2 className="text-sm font-semibold text-zinc-900">Deuda con proveedores de China</h2>
        <p className="text-xs text-zinc-500">Pagos a cuenta y envíos desde una cuenta puente. El saldo de arriba (China) baja con lo que registres aquí.</p>
      </div>

      <FormularioProveedor proveedores={nombresProveedores} cuentas={listaCuentas} ultimos={ultimos} />

      <EnvioPuente
        cuentas={listaCuentas}
        proveedores={nombresProveedores}
        contenedores={(contenedores ?? []).map((c) => ({
          id: c.id,
          numero: c.numero,
          proveedor: c.fabrica_principal ?? c.proveedor_principal,
        }))}
        abonosPendientes={abonosPendientes ?? []}
      />

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Historial</h2>
        </div>
        {historial.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">Todavía no hay movimientos.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {historial.map((m) => (
              <FilaHistorial key={m.id} m={m} cuentas={listaCuentas} ligado={estaLigado(m)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

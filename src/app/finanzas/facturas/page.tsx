import { createClient } from "@/lib/supabase/server";
import { saldoFactura } from "@/lib/calculos-facturas";
import { formatoPesos, formatoDolares, formatoFecha } from "@/lib/formato";
import type { CategoriaFinanciera, CuentaFinanciera, FacturaPendiente, PagoFactura } from "@/lib/tipos";
import { eliminarFactura } from "../actions";
import { FormularioFactura } from "./formulario-factura";
import { RegistrarPago } from "./registrar-pago";
import { PagoItem } from "./pago-item";

export default async function FacturasFinanzas() {
  const supabase = await createClient();
  const [{ data: facturas }, { data: pagos }, { data: cuentas }, { data: categorias }] = await Promise.all([
    supabase
      .from("facturas_pendientes")
      .select("*")
      .order("fecha_limite", { ascending: true, nullsFirst: false })
      .returns<FacturaPendiente[]>(),
    supabase.from("pagos_factura").select("*").returns<PagoFactura[]>(),
    supabase.from("cuentas_financieras").select("*").is("eliminado_en", null).returns<CuentaFinanciera[]>(),
    supabase.from("categorias_financieras").select("*").is("eliminado_en", null).returns<CategoriaFinanciera[]>(),
  ]);

  const listaFacturas = facturas ?? [];
  const listaPagos = pagos ?? [];
  const listaCuentas = cuentas ?? [];
  const listaCategorias = categorias ?? [];

  const conSaldo = listaFacturas.map((f) => ({ factura: f, ...saldoFactura(f, listaPagos) }));
  const pendientes = conSaldo.filter((f) => f.saldo > 0.01);
  const pagadas = conSaldo.filter((f) => f.saldo <= 0.01).slice(0, 10);

  const totalPendienteMxn = pendientes.filter((f) => f.factura.moneda === "MXN").reduce((s, f) => s + f.saldo, 0);
  const totalPendienteUsd = pendientes.filter((f) => f.factura.moneda === "USD").reduce((s, f) => s + f.saldo, 0);

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-500">
        Cuentas por pagar sueltas (proveedores de México, servicios, etc.) — independientes de préstamos, deuda con
        proveedores de China o crédito de contenedor. Puedes ir abonando poco a poco a una factura, no tiene que
        pagarse de un jalón.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Pendiente en pesos</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">{formatoPesos(totalPendienteMxn)}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Pendiente en dólares</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">{formatoDolares(totalPendienteUsd)}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Nueva factura pendiente</h2>
        <FormularioFactura />
      </div>

      <RegistrarPago
        facturas={pendientes.map((f) => ({
          id: f.factura.id,
          folio: f.factura.folio,
          proveedor: f.factura.proveedor,
          moneda: f.factura.moneda,
          saldo: f.saldo,
        }))}
        cuentas={listaCuentas}
        categorias={listaCategorias}
      />

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Pendientes de pagar</h2>
          <p className="mt-1 text-xs text-zinc-500">Ordenadas por fecha límite más próxima primero.</p>
        </div>
        {pendientes.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">No tienes facturas pendientes.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {pendientes.map(({ factura, pagado, saldo }) => {
              const pagosDeFactura = listaPagos
                .filter((p) => p.factura_id === factura.id)
                .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
              return (
                <div key={factura.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-zinc-900">
                        {factura.folio ? `Folio ${factura.folio} — ` : ""}
                        {factura.proveedor}
                      </p>
                      <p className="text-xs text-zinc-500">{factura.concepto || "—"}</p>
                      <p className="mt-1 text-xs text-zinc-400">
                        {factura.fecha_limite ? <>Vence {formatoFecha(factura.fecha_limite)}</> : "Sin fecha límite"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-zinc-900">
                        {factura.moneda === "USD" ? formatoDolares(saldo) : formatoPesos(saldo)}
                        <span className="ml-1 text-xs font-normal text-zinc-400">de {factura.moneda === "USD" ? formatoDolares(factura.monto) : formatoPesos(factura.monto)}</span>
                      </p>
                      {pagado === 0 && (
                        <form action={eliminarFactura.bind(null, factura.id)} className="mt-1">
                          <button type="submit" className="text-xs font-medium text-red-600 hover:text-red-800">
                            Quitar
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                  {pagosDeFactura.length > 0 && (
                    <div className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-100">
                      {pagosDeFactura.map((pago) => (
                        <PagoItem key={pago.id} pago={pago} moneda={factura.moneda} cuentas={listaCuentas} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pagadas.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 p-6">
            <h2 className="text-sm font-semibold text-zinc-900">Pagadas recientemente</h2>
          </div>
          <div className="divide-y divide-zinc-100">
            {pagadas.map(({ factura }) => (
              <div key={factura.id} className="flex items-center justify-between px-6 py-3 text-sm">
                <p className="text-zinc-500">
                  {factura.folio ? `Folio ${factura.folio} — ` : ""}
                  {factura.proveedor}
                </p>
                <p className="font-medium text-zinc-400 line-through">
                  {factura.moneda === "USD" ? formatoDolares(factura.monto) : formatoPesos(factura.monto)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

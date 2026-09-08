import { createClient } from "@/lib/supabase/server";
import { CampoFecha } from "@/components/campo-fecha";
import { Selector } from "@/components/selector";
import { formatoPesos, formatoDolares, formatoFecha } from "@/lib/formato";
import type { CategoriaFinanciera, CuentaFinanciera, FacturaPendiente } from "@/lib/tipos";
import { agregarFactura, eliminarFactura } from "../actions";
import { MarcarPagada } from "./marcar-pagada";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export default async function FacturasFinanzas() {
  const supabase = await createClient();
  const [{ data: facturas }, { data: cuentas }, { data: categorias }] = await Promise.all([
    supabase
      .from("facturas_pendientes")
      .select("*")
      .order("fecha_limite", { ascending: true, nullsFirst: false })
      .returns<FacturaPendiente[]>(),
    supabase.from("cuentas_financieras").select("*").is("eliminado_en", null).returns<CuentaFinanciera[]>(),
    supabase.from("categorias_financieras").select("*").is("eliminado_en", null).returns<CategoriaFinanciera[]>(),
  ]);

  const listaCuentas = cuentas ?? [];
  const listaCategorias = categorias ?? [];
  const pendientes = (facturas ?? []).filter((f) => !f.pagada);
  const pagadasRecientes = (facturas ?? []).filter((f) => f.pagada).slice(0, 10);

  const totalPendienteMxn = pendientes.filter((f) => f.moneda === "MXN").reduce((s, f) => s + f.monto, 0);
  const totalPendienteUsd = pendientes.filter((f) => f.moneda === "USD").reduce((s, f) => s + f.monto, 0);
  const hoyTexto = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
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
        <form action={agregarFactura} className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500">Proveedor</label>
              <input type="text" name="proveedor" required className={claseCampo} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Concepto</label>
              <input type="text" name="concepto" placeholder="Opcional" className={claseCampo} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500">Monto</label>
              <input type="number" name="monto" min={0.01} step="0.01" required className={claseCampo} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Moneda</label>
              <div className="mt-1">
                <Selector
                  name="moneda"
                  defaultValue="MXN"
                  opciones={[
                    { value: "MXN", label: "Pesos (MXN)" },
                    { value: "USD", label: "Dólares (USD)" },
                  ]}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Fecha de la factura</label>
              <CampoFecha name="fecha_emision" defaultValue={hoyTexto} max={hoyTexto} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Fecha límite (opcional)</label>
              <CampoFecha name="fecha_limite" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Notas</label>
            <input type="text" name="notas" placeholder="Opcional" className={claseCampo} />
          </div>
          <div className="flex justify-end pt-1">
            <button
              type="submit"
              className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700"
            >
              Agregar
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Pendientes de pagar</h2>
          <p className="mt-1 text-xs text-zinc-500">Ordenadas por fecha límite más próxima primero.</p>
        </div>
        {pendientes.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">No tienes facturas pendientes.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {pendientes.map((factura) => (
              <div key={factura.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{factura.proveedor}</p>
                    <p className="text-xs text-zinc-500">{factura.concepto || "—"}</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {factura.fecha_limite ? (
                        <>Vence {formatoFecha(factura.fecha_limite)}</>
                      ) : (
                        "Sin fecha límite"
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-zinc-900">
                      {factura.moneda === "USD" ? formatoDolares(factura.monto) : formatoPesos(factura.monto)}
                    </p>
                    <div className="mt-1 flex items-center justify-end gap-3">
                      <form action={eliminarFactura.bind(null, factura.id)}>
                        <button type="submit" className="text-xs font-medium text-red-600 hover:text-red-800">
                          Quitar
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex justify-end">
                  <MarcarPagada facturaId={factura.id} cuentas={listaCuentas} categorias={listaCategorias} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {pagadasRecientes.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 p-6">
            <h2 className="text-sm font-semibold text-zinc-900">Pagadas recientemente</h2>
          </div>
          <div className="divide-y divide-zinc-100">
            {pagadasRecientes.map((factura) => (
              <div key={factura.id} className="flex items-center justify-between px-6 py-3 text-sm">
                <p className="text-zinc-500">{factura.proveedor}</p>
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

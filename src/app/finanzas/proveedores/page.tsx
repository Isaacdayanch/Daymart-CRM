import { createClient } from "@/lib/supabase/server";
import { formatoPesos, formatoDolares, formatoFecha } from "@/lib/formato";
import { cargosAbiertosProveedor, proveedoresConDeuda, saldoProveedor } from "@/lib/calculos-socios-deuda";
import type { Contenedor, CuentaFinanciera, MovimientoDeudaProveedor } from "@/lib/tipos";
import { FormularioProveedor } from "./formulario-proveedor";
import { EnvioPuente } from "./envio-puente";

export default async function ProveedoresFinanzas() {
  const supabase = await createClient();
  const [{ data: movimientos }, { data: cuentas }, { data: contenedores }] = await Promise.all([
    supabase.from("movimientos_deuda_proveedor").select("*").returns<MovimientoDeudaProveedor[]>(),
    supabase.from("cuentas_financieras").select("*").is("eliminado_en", null).returns<CuentaFinanciera[]>(),
    supabase
      .from("contenedores")
      .select("*")
      .is("eliminado_en", null)
      .order("numero", { ascending: false })
      .returns<Contenedor[]>(),
  ]);

  const listaMovimientos = movimientos ?? [];
  const listaCuentas = cuentas ?? [];
  const nombresProveedores = proveedoresConDeuda(listaMovimientos);
  const historial = [...listaMovimientos].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-500">
        Cuánto le debes a cada proveedor — el saldo se lleva por proveedor en general (no por contenedor), igual
        que abonas &ldquo;a cuenta&rdquo;. Cada cargo puede traer su propia fecha límite; los abonos se aplican
        al cargo más viejo primero.
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

      <FormularioProveedor proveedores={nombresProveedores} cuentas={listaCuentas} />

      <EnvioPuente
        cuentas={listaCuentas}
        proveedores={nombresProveedores}
        contenedores={(contenedores ?? []).map((c) => ({ id: c.id, numero: c.numero }))}
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
              <div key={m.id} className="flex items-center justify-between px-6 py-3 text-sm">
                <div>
                  <p className="font-medium text-zinc-900">
                    {m.proveedor} · {m.tipo === "CARGO" ? "Cargo" : "Abono"}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatoFecha(m.fecha)} {m.notas ? `— ${m.notas}` : ""}
                    {m.tipo === "CARGO" && m.fecha_limite ? ` · vence ${formatoFecha(m.fecha_limite)}` : ""}
                  </p>
                </div>
                <p className={`font-semibold ${m.tipo === "CARGO" ? "text-red-600" : "text-emerald-600"}`}>
                  {m.tipo === "CARGO" ? "+" : "-"}
                  {m.moneda === "USD" ? formatoDolares(m.monto) : formatoPesos(m.monto)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

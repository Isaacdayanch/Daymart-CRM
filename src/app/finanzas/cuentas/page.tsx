import { createClient } from "@/lib/supabase/server";
import { saldosPorCuenta } from "@/lib/calculos-financieras";
import { formatoPesos, formatoDolares, formatoFecha } from "@/lib/formato";
import type { CuentaFinanciera, MovimientoFinanciero } from "@/lib/tipos";
import { eliminarCuenta } from "../actions";
import { FormularioCuenta } from "./formulario-cuenta";

const TIPOS = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "BANCO", label: "Banco" },
  { value: "OTRO", label: "Otro" },
];

export default async function CuentasFinanzas() {
  const supabase = await createClient();
  const [{ data: cuentas }, { data: movimientos }] = await Promise.all([
    supabase
      .from("cuentas_financieras")
      .select("*")
      .is("eliminado_en", null)
      .order("creado_en", { ascending: true })
      .returns<CuentaFinanciera[]>(),
    supabase.from("movimientos_financieros").select("*").returns<MovimientoFinanciero[]>(),
  ]);

  const listaCuentas = cuentas ?? [];
  const saldos = saldosPorCuenta(listaCuentas, movimientos ?? []);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Nueva cuenta</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Caja, bancos, y más adelante cuentas como Mercado Pago — el saldo se calcula solo, nunca se
          escribe a mano.
        </p>
        <FormularioCuenta />
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="divide-y divide-zinc-100">
          {saldos.map(({ cuenta, saldoMxn, saldoUsd }) => (
            <div key={cuenta.id} className="flex items-center justify-between px-6 py-4">
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  {cuenta.nombre}
                  {cuenta.cuenta_transito && (
                    <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                      de tránsito
                    </span>
                  )}
                </p>
                <p className="text-xs text-zinc-400">
                  {TIPOS.find((t) => t.value === cuenta.tipo)?.label ?? cuenta.tipo} · desde{" "}
                  {formatoFecha(cuenta.creado_en)}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm font-semibold text-zinc-900">{formatoPesos(saldoMxn)}</p>
                  {saldoUsd !== 0 && <p className="text-xs text-zinc-400">{formatoDolares(saldoUsd)}</p>}
                </div>
                <form action={eliminarCuenta.bind(null, cuenta.id)}>
                  <button type="submit" className="text-sm font-medium text-red-600 hover:text-red-800">
                    Quitar
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

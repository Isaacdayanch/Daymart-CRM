import { createClient } from "@/lib/supabase/server";
import { saldosPorCuenta } from "@/lib/calculos-financieras";
import { formatoPesos, formatoDolares, formatoFecha } from "@/lib/formato";
import { Selector } from "@/components/selector";
import type { CuentaFinanciera, MovimientoFinanciero } from "@/lib/tipos";
import { agregarCuenta, eliminarCuenta } from "../actions";

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
        <form action={agregarCuenta} className="mt-4 flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-zinc-500">Nombre</label>
            <input
              type="text"
              name="nombre"
              required
              placeholder="Ej. Banco Santander"
              className="mt-1 block w-full max-w-xs rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Tipo</label>
            <div className="mt-1">
              <Selector name="tipo" defaultValue="BANCO" opciones={TIPOS} />
            </div>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
          >
            Agregar
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="divide-y divide-zinc-100">
          {saldos.map(({ cuenta, saldoMxn, saldoUsd }) => (
            <div key={cuenta.id} className="flex items-center justify-between px-6 py-4">
              <div>
                <p className="text-sm font-medium text-zinc-900">{cuenta.nombre}</p>
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

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { saldosPorCuenta } from "@/lib/calculos-financieras";
import { formatoPesos, formatoDolares } from "@/lib/formato";
import type { CuentaFinanciera, MovimientoFinanciero } from "@/lib/tipos";

export default async function ResumenFinanzas() {
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
  const totalMxn = saldos.reduce((s, c) => s + c.saldoMxn, 0);
  const totalUsd = saldos.reduce((s, c) => s + c.saldoUsd, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Total en pesos</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">{formatoPesos(totalMxn)}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Total en dólares</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">{formatoDolares(totalUsd)}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Saldo por cuenta</h2>
          <Link href="/finanzas/cuentas" className="text-xs font-medium text-zinc-500 hover:text-zinc-900">
            Administrar cuentas →
          </Link>
        </div>
        {listaCuentas.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">Todavía no tienes cuentas. Agrega una en &ldquo;Cuentas&rdquo;.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {saldos.map(({ cuenta, saldoMxn, saldoUsd }) => (
              <div key={cuenta.id} className="flex items-center justify-between px-6 py-3.5 text-sm">
                <p className="font-medium text-zinc-900">{cuenta.nombre}</p>
                <div className="text-right">
                  <p className="font-semibold text-zinc-900">{formatoPesos(saldoMxn)}</p>
                  {saldoUsd !== 0 && <p className="text-xs text-zinc-400">{formatoDolares(saldoUsd)}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-zinc-400">
        El resumen se irá completando conforme se construya el resto del módulo: movimientos, préstamos,
        pagos a China y el estado de cuenta de deudas.
      </p>
    </div>
  );
}

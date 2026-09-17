import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { saldosPorCuenta } from "@/lib/calculos-financieras";
import { formatoPesos, formatoDolares } from "@/lib/formato";
import type { CuentaFinanciera, MovimientoFinanciero } from "@/lib/tipos";
import { EditarCuentas } from "./editar-cuentas";

const TIPOS: Record<string, string> = { EFECTIVO: "Efectivo", BANCO: "Banco", OTRO: "Otro" };

/** Cuentas: la lista limpia, cada una es un link a su estado de cuenta.
 * Alta/baja viven escondidas en "Editar cuentas" (abajo, discreto). */
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
  const movimientosPorCuenta = new Map<string, number>();
  for (const m of movimientos ?? []) {
    movimientosPorCuenta.set(m.cuenta_id, (movimientosPorCuenta.get(m.cuenta_id) ?? 0) + 1);
    if (m.cuenta_destino_id) movimientosPorCuenta.set(m.cuenta_destino_id, (movimientosPorCuenta.get(m.cuenta_destino_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">Mis cuentas</h2>
          <p className="text-xs text-zinc-500">Dale clic a una cuenta para ver su estado de cuenta, filtrarlo por mes e imprimirlo.</p>
        </div>
        {listaCuentas.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">Todavía no hay cuentas. Agrégalas en “Editar cuentas”.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {saldos.map(({ cuenta, saldoMxn, saldoUsd }) => (
              <Link
                key={cuenta.id}
                href={`/finanzas/cuentas/${cuenta.id}`}
                className="flex items-center justify-between px-6 py-4 transition hover:bg-zinc-50"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900">
                    {cuenta.nombre}
                    {cuenta.cuenta_transito && (
                      <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">de tránsito</span>
                    )}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {TIPOS[cuenta.tipo] ?? cuenta.tipo} · {(movimientosPorCuenta.get(cuenta.id) ?? 0).toLocaleString("es-MX")} movimientos
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-zinc-900">{formatoPesos(saldoMxn)}</p>
                    {saldoUsd !== 0 && <p className="text-xs text-zinc-400">{formatoDolares(saldoUsd)}</p>}
                  </div>
                  <span className="text-zinc-300">›</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <EditarCuentas cuentas={listaCuentas} />
    </div>
  );
}

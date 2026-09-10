import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { saldosPorCuenta } from "@/lib/calculos-financieras";
import { formatoPesos, formatoDolares, formatoFecha } from "@/lib/formato";
import type { CategoriaFinanciera, CuentaFinanciera, MovimientoFinanciero } from "@/lib/tipos";
import { FormularioMovimiento } from "./formulario-movimiento";

const ETIQUETA_TIPO: Record<string, string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  TRANSFERENCIA: "Transferencia",
};

export default async function ResumenFinanzas() {
  const supabase = await createClient();
  const [{ data: cuentas }, { data: movimientos }, { data: categorias }] = await Promise.all([
    supabase
      .from("cuentas_financieras")
      .select("*")
      .is("eliminado_en", null)
      .order("creado_en", { ascending: true })
      .returns<CuentaFinanciera[]>(),
    supabase
      .from("movimientos_financieros")
      .select("*")
      .order("fecha", { ascending: false })
      .returns<MovimientoFinanciero[]>(),
    supabase
      .from("categorias_financieras")
      .select("*")
      .is("eliminado_en", null)
      .order("orden", { ascending: true })
      .returns<CategoriaFinanciera[]>(),
  ]);

  const listaCuentas = cuentas ?? [];
  const listaMovimientos = movimientos ?? [];
  const cuentasPorId = new Map(listaCuentas.map((c) => [c.id, c.nombre]));
  const categoriasPorId = new Map((categorias ?? []).map((c) => [c.id, c.nombre]));

  const saldos = saldosPorCuenta(listaCuentas, listaMovimientos);
  const totalMxn = saldos.filter((s) => !s.cuenta.cuenta_transito).reduce((s, c) => s + c.saldoMxn, 0);
  const totalUsd = saldos.filter((s) => !s.cuenta.cuenta_transito).reduce((s, c) => s + c.saldoUsd, 0);
  const ultimosMovimientos = listaMovimientos.slice(0, 8);

  return (
    <div className="space-y-6">
      <FormularioMovimiento cuentas={listaCuentas} categorias={categorias ?? []} />

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
        <div className="border-b border-zinc-100 p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Saldo por cuenta</h2>
        </div>
        {listaCuentas.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">
            Todavía no tienes cuentas. Agrega una en &ldquo;Cuentas&rdquo;.
          </p>
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

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Últimos movimientos</h2>
          <Link href="/finanzas/movimientos" className="text-xs font-medium text-zinc-500 hover:text-zinc-900">
            Ver todos →
          </Link>
        </div>
        {ultimosMovimientos.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">Todavía no has registrado ningún movimiento.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {ultimosMovimientos.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-6 py-3 text-sm">
                <div>
                  <p className="font-medium text-zinc-900">
                    {m.contraparte || categoriasPorId.get(m.categoria_id ?? "") || ETIQUETA_TIPO[m.tipo]}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {formatoFecha(m.fecha)} · {cuentasPorId.get(m.cuenta_id) ?? "—"}
                    {m.tipo === "TRANSFERENCIA" && ` → ${cuentasPorId.get(m.cuenta_destino_id ?? "") ?? "—"}`}
                  </p>
                </div>
                <p
                  className={`font-semibold ${
                    m.tipo === "ENTRADA"
                      ? "text-emerald-600"
                      : m.tipo === "SALIDA"
                        ? "text-red-600"
                        : "text-zinc-500"
                  }`}
                >
                  {m.tipo === "SALIDA" ? "-" : m.tipo === "ENTRADA" ? "+" : ""}
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

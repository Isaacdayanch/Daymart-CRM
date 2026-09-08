import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatoPesos, formatoDolares, formatoFecha } from "@/lib/formato";
import type { CategoriaFinanciera, CuentaFinanciera, MovimientoFinanciero } from "@/lib/tipos";

export default async function MovimientosFinanzas() {
  const supabase = await createClient();
  const [{ data: movimientos }, { data: cuentas }, { data: categorias }] = await Promise.all([
    supabase
      .from("movimientos_financieros")
      .select("*")
      .order("fecha", { ascending: false })
      .limit(300)
      .returns<MovimientoFinanciero[]>(),
    supabase.from("cuentas_financieras").select("*").returns<CuentaFinanciera[]>(),
    supabase.from("categorias_financieras").select("*").returns<CategoriaFinanciera[]>(),
  ]);

  const listaMovimientos = movimientos ?? [];
  const cuentasPorId = new Map((cuentas ?? []).map((c) => [c.id, c.nombre]));
  const categoriasPorId = new Map((categorias ?? []).map((c) => [c.id, c.nombre]));

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-100 p-6">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Libro de movimientos</h2>
          <p className="mt-1 text-xs text-zinc-500">Entradas, salidas y transferencias, más recientes primero.</p>
        </div>
        <Link href="/finanzas" className="text-xs font-medium text-zinc-500 hover:text-zinc-900">
          ← Registrar uno nuevo
        </Link>
      </div>
      {listaMovimientos.length === 0 ? (
        <p className="p-6 text-sm text-zinc-500">Todavía no hay movimientos.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-xs text-zinc-400">
                <th className="px-6 py-2.5 font-medium">Fecha</th>
                <th className="px-6 py-2.5 font-medium">Tipo</th>
                <th className="px-6 py-2.5 font-medium">Cuenta</th>
                <th className="px-6 py-2.5 font-medium">Categoría</th>
                <th className="px-6 py-2.5 font-medium">Contraparte / notas</th>
                <th className="px-6 py-2.5 font-medium text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {listaMovimientos.map((m) => (
                <tr key={m.id}>
                  <td className="px-6 py-3 text-xs text-zinc-500">{formatoFecha(m.fecha)}</td>
                  <td className="px-6 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        m.tipo === "ENTRADA"
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                          : m.tipo === "SALIDA"
                            ? "bg-red-50 text-red-700 ring-red-600/20"
                            : "bg-zinc-100 text-zinc-600 ring-zinc-500/20"
                      }`}
                    >
                      {m.tipo === "ENTRADA" ? "Entrada" : m.tipo === "SALIDA" ? "Salida" : "Transferencia"}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-zinc-600">
                    {cuentasPorId.get(m.cuenta_id) ?? "—"}
                    {m.tipo === "TRANSFERENCIA" && ` → ${cuentasPorId.get(m.cuenta_destino_id ?? "") ?? "—"}`}
                  </td>
                  <td className="px-6 py-3 text-zinc-600">{categoriasPorId.get(m.categoria_id ?? "") ?? "—"}</td>
                  <td className="px-6 py-3 text-xs text-zinc-500">
                    {[m.contraparte, m.notas].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td
                    className={`px-6 py-3 text-right font-semibold ${
                      m.tipo === "ENTRADA" ? "text-emerald-600" : m.tipo === "SALIDA" ? "text-red-600" : "text-zinc-900"
                    }`}
                  >
                    {m.tipo === "SALIDA" ? "-" : m.tipo === "ENTRADA" ? "+" : ""}
                    {m.moneda === "USD" ? formatoDolares(m.monto) : formatoPesos(m.monto)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

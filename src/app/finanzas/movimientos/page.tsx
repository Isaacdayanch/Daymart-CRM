import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { CategoriaFinanciera, CuentaFinanciera, MovimientoFinanciero } from "@/lib/tipos";
import { FilaMovimiento } from "./fila-movimiento";

export default async function MovimientosFinanzas() {
  const supabase = await createClient();
  const [
    { data: movimientos },
    { data: cuentas },
    { data: categorias },
    { data: pagosMercancia },
    { data: movimientosDeuda },
    { data: pagosFactura },
  ] = await Promise.all([
    supabase
      .from("movimientos_financieros")
      .select("*")
      .order("fecha", { ascending: false })
      .limit(300)
      .returns<MovimientoFinanciero[]>(),
    supabase.from("cuentas_financieras").select("*").returns<CuentaFinanciera[]>(),
    supabase.from("categorias_financieras").select("*").returns<CategoriaFinanciera[]>(),
    supabase.from("pagos_mercancia").select("movimiento_financiero_id").not("movimiento_financiero_id", "is", null),
    supabase
      .from("movimientos_deuda_proveedor")
      .select("movimiento_financiero_id")
      .not("movimiento_financiero_id", "is", null),
    supabase.from("pagos_factura").select("movimiento_financiero_id").not("movimiento_financiero_id", "is", null),
  ]);

  const listaMovimientos = movimientos ?? [];
  const cuentasPorId = new Map((cuentas ?? []).map((c) => [c.id, c.nombre]));
  const categoriasPorId = new Map((categorias ?? []).map((c) => [c.id, c.nombre]));

  // Un movimiento "ligado" viene de otra pantalla (abono de contenedor,
  // abono a proveedor, pago de factura) — se edita desde ahí, no aquí, para
  // no desincronizar los dos registros del mismo dato.
  const idsLigados = new Set(
    [...(pagosMercancia ?? []), ...(movimientosDeuda ?? []), ...(pagosFactura ?? [])]
      .map((r) => r.movimiento_financiero_id)
      .filter((id): id is string => Boolean(id)),
  );

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
                <th className="px-6 py-2.5 font-medium text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {listaMovimientos.map((m) => (
                <FilaMovimiento
                  key={m.id}
                  movimiento={m}
                  cuentas={cuentas ?? []}
                  categorias={categorias ?? []}
                  cuentaNombre={cuentasPorId.get(m.cuenta_id) ?? "—"}
                  cuentaDestinoNombre={cuentasPorId.get(m.cuenta_destino_id ?? "") ?? "—"}
                  categoriaNombre={categoriasPorId.get(m.categoria_id ?? "") ?? "—"}
                  bloqueado={idsLigados.has(m.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { CategoriaFinanciera, CuentaFinanciera, MovimientoFinanciero } from "@/lib/tipos";
import { fechaTextoMx } from "@/lib/fechas-mx";
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
    { data: cobrosVenta },
    { data: enviosChina },
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
    supabase.from("cobros_venta").select("movimiento_financiero_id").not("movimiento_financiero_id", "is", null),
    supabase.from("envios_china").select("movimiento_transferencia_id").eq("estado", "PENDIENTE").not("movimiento_transferencia_id", "is", null),
  ]);

  const listaMovimientos = movimientos ?? [];
  const cuentasPorId = new Map((cuentas ?? []).map((c) => [c.id, c.nombre]));
  const categoriasPorId = new Map((categorias ?? []).map((c) => [c.id, c.nombre]));

  // Un movimiento "ligado" viene de otra pantalla (abono de contenedor,
  // abono a proveedor, pago de factura, cobro de venta) — se edita desde ahí, no aquí, para
  // no desincronizar los dos registros del mismo dato. Se guarda DE DÓNDE
  // viene para decírselo a Isaac en el renglón.
  const origenLigado = new Map<string, string>();
  const anotar = (filas: { movimiento_financiero_id: string | null }[] | null, origen: string) => {
    for (const f of filas ?? []) if (f.movimiento_financiero_id) origenLigado.set(f.movimiento_financiero_id, origen);
  };
  anotar(pagosMercancia, "un abono de contenedor");
  anotar(movimientosDeuda, "Proveedores");
  anotar(pagosFactura, "un pago de factura");
  anotar(cobrosVenta, "un cobro de venta");
  anotar((enviosChina ?? []).map((e) => ({ movimiento_financiero_id: e.movimiento_transferencia_id })), "un pago a proveedores pendiente");

  // Agrupado por mes, para que el ojo encuentre rápido dónde va.
  const porMes = new Map<string, MovimientoFinanciero[]>();
  for (const m of listaMovimientos) {
    const clave = fechaTextoMx(new Date(m.fecha)).slice(0, 7);
    porMes.set(clave, [...(porMes.get(clave) ?? []), m]);
  }
  const nombreMes = (clave: string) => {
    const [anio, mes] = clave.split("-").map(Number);
    return new Date(anio, mes - 1, 1).toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-100 p-5 sm:p-6">
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
        Array.from(porMes.entries()).map(([clave, lista]) => (
          <section key={clave}>
            <p className="border-b border-zinc-100 bg-zinc-50/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:px-6">{nombreMes(clave)}</p>
            <ul className="divide-y divide-zinc-100">
              {lista.map((m) => (
                <FilaMovimiento
                  key={m.id}
                  movimiento={m}
                  cuentas={cuentas ?? []}
                  categorias={categorias ?? []}
                  cuentaNombre={cuentasPorId.get(m.cuenta_id) ?? "—"}
                  cuentaDestinoNombre={cuentasPorId.get(m.cuenta_destino_id ?? "") ?? "—"}
                  categoriaNombre={categoriasPorId.get(m.categoria_id ?? "") ?? "—"}
                  origenLigado={origenLigado.get(m.id) ?? null}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

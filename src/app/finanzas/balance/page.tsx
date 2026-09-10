import { createClient } from "@/lib/supabase/server";
import { resumenPorSku } from "@/lib/calculos-stock";
import { obtenerPiezasPorCajaPorSku } from "@/lib/productos-stock";
import { saldosPorCuenta } from "@/lib/calculos-financieras";
import { proveedoresConDeuda, saldoProveedor } from "@/lib/calculos-socios-deuda";
import { formatoPesos, formatoDolares } from "@/lib/formato";
import type {
  ConfiguracionStock,
  CuentaFinanciera,
  MovimientoDeudaProveedor,
  MovimientoFinanciero,
  MovimientoPrestamista,
  MovimientoStock,
  Prestamista,
} from "@/lib/tipos";

export default async function BalanceFinanzas() {
  const supabase = await createClient();
  const [
    { data: movimientosStock },
    { data: configuracion },
    piezasPorCajaPorSku,
    { data: cuentas },
    { data: movimientosFinancieros },
    { data: prestamistas },
    { data: movimientosPrestamista },
    { data: movimientosDeudaProveedor },
  ] = await Promise.all([
    supabase.from("movimientos_stock").select("*").returns<MovimientoStock[]>(),
    supabase.from("configuracion_stock").select("*").single<ConfiguracionStock>(),
    obtenerPiezasPorCajaPorSku(supabase),
    supabase.from("cuentas_financieras").select("*").is("eliminado_en", null).returns<CuentaFinanciera[]>(),
    supabase.from("movimientos_financieros").select("*").returns<MovimientoFinanciero[]>(),
    supabase.from("prestamistas").select("*").returns<Prestamista[]>(),
    supabase.from("movimientos_prestamista").select("*").returns<MovimientoPrestamista[]>(),
    supabase.from("movimientos_deuda_proveedor").select("*").returns<MovimientoDeudaProveedor[]>(),
  ]);

  const resumenes = resumenPorSku(movimientosStock ?? [], configuracion?.dias_espera ?? 60, piezasPorCajaPorSku);
  const valorInventario = resumenes.reduce((s, r) => s + r.valorInventario, 0);

  const cuentasReales = (cuentas ?? []).filter((c) => !c.cuenta_transito);
  const saldos = saldosPorCuenta(cuentasReales, movimientosFinancieros ?? []);
  const cajaMxn = saldos.reduce((s, c) => s + c.saldoMxn, 0);
  const cajaUsd = saldos.reduce((s, c) => s + c.saldoUsd, 0);

  const listaPrestamistas = prestamistas ?? [];
  const listaMovPrestamista = movimientosPrestamista ?? [];
  const deudaPrestamosMxn = listaPrestamistas.reduce(
    (s, p) =>
      s +
      listaMovPrestamista
        .filter((m) => m.prestamista_id === p.id && m.moneda === "MXN")
        .reduce((sub, m) => sub + (m.tipo === "PRESTAMO" ? m.monto : -m.monto), 0),
    0,
  );
  const deudaPrestamosUsd = listaPrestamistas.reduce(
    (s, p) =>
      s +
      listaMovPrestamista
        .filter((m) => m.prestamista_id === p.id && m.moneda === "USD")
        .reduce((sub, m) => sub + (m.tipo === "PRESTAMO" ? m.monto : -m.monto), 0),
    0,
  );

  const listaMovDeudaProveedor = movimientosDeudaProveedor ?? [];
  const proveedores = proveedoresConDeuda(listaMovDeudaProveedor);
  const deudaProveedoresUsd = proveedores.reduce((s, p) => s + saldoProveedor(listaMovDeudaProveedor, p, "USD"), 0);
  const deudaProveedoresMxn = proveedores.reduce((s, p) => s + saldoProveedor(listaMovDeudaProveedor, p, "MXN"), 0);

  const activoMxn = cajaMxn + valorInventario;
  const pasivoMxn = deudaPrestamosMxn + deudaProveedoresMxn;
  const pasivoUsd = deudaPrestamosUsd + deudaProveedoresUsd;

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-500">
        Lo que tienes (caja + inventario) contra lo que debes (préstamos + proveedores) — para saber si estás
        protegido. Ojo: todavía no incluye la mercancía ya pagada pero pendiente en China; se puede agregar
        después.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <h2 className="text-sm font-semibold text-emerald-900">Tienes (activo)</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-emerald-800">Saldo en cuentas</dt>
              <dd className="font-medium text-emerald-900">
                {formatoPesos(cajaMxn)} {cajaUsd !== 0 && `+ ${formatoDolares(cajaUsd)}`}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-emerald-800">Valor de inventario</dt>
              <dd className="font-medium text-emerald-900">{formatoPesos(valorInventario)}</dd>
            </div>
          </dl>
          <div className="mt-4 border-t border-emerald-200 pt-3">
            <p className="text-xs text-emerald-700">Total en pesos (sin contar dólares en caja)</p>
            <p className="text-xl font-bold text-emerald-900">{formatoPesos(activoMxn)}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-sm font-semibold text-red-900">Debes (pasivo)</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-red-800">Préstamos vivos</dt>
              <dd className="font-medium text-red-900">
                {formatoPesos(deudaPrestamosMxn)} {deudaPrestamosUsd !== 0 && `+ ${formatoDolares(deudaPrestamosUsd)}`}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-red-800">Deuda con proveedores</dt>
              <dd className="font-medium text-red-900">
                {formatoPesos(deudaProveedoresMxn)}{" "}
                {deudaProveedoresUsd !== 0 && `+ ${formatoDolares(deudaProveedoresUsd)}`}
              </dd>
            </div>
          </dl>
          <div className="mt-4 border-t border-red-200 pt-3">
            <p className="text-xs text-red-700">Total en pesos + dólares (por separado)</p>
            <p className="text-xl font-bold text-red-900">
              {formatoPesos(pasivoMxn)} {pasivoUsd !== 0 && `+ ${formatoDolares(pasivoUsd)}`}
            </p>
          </div>
        </div>
      </div>

      <div
        className={`rounded-2xl p-6 text-white shadow-sm ${
          activoMxn >= pasivoMxn ? "bg-emerald-600" : "bg-red-600"
        }`}
      >
        <p className="text-sm font-medium opacity-90">
          {activoMxn >= pasivoMxn ? "Estás protegido: tu activo cubre tu deuda en pesos" : "Ojo: tu deuda en pesos es mayor a lo que tienes"}
        </p>
        <p className="mt-1 text-2xl font-bold">{formatoPesos(activoMxn - pasivoMxn)}</p>
      </div>
    </div>
  );
}

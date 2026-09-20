import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { saldosPorCuenta } from "@/lib/calculos-financieras";
import { formatoPesos, formatoDolares, formatoFecha } from "@/lib/formato";
import type { CategoriaFinanciera, Contenedor, CuentaFinanciera, EnvioChina, FacturaPendiente, MovimientoDeudaProveedor, MovimientoFinanciero, PagoFactura } from "@/lib/tipos";
import { saldoFactura } from "@/lib/calculos-facturas";
import { proveedoresConDeuda } from "@/lib/calculos-socios-deuda";
import { FormularioMovimiento } from "./formulario-movimiento";
import { PendientesChina } from "./pendientes-china";

const ETIQUETA_TIPO: Record<string, string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  TRANSFERENCIA: "Transferencia",
};

export default async function ResumenFinanzas({ searchParams }: { searchParams: Promise<{ cuenta?: string }> }) {
  const { cuenta: cuentaInicial } = await searchParams;
  const supabase = await createClient();
  const [{ data: cuentas }, { data: movimientos }, { data: categorias }, { data: facturas }, { data: pagosFactura }, { data: deudaProveedores }, { data: contenedores }, { data: abonosPendientes }, { data: enviosChina }] = await Promise.all([
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
    supabase.from("facturas_pendientes").select("*").order("fecha_emision", { ascending: false }).returns<FacturaPendiente[]>(),
    supabase.from("pagos_factura").select("*").returns<PagoFactura[]>(),
    supabase.from("movimientos_deuda_proveedor").select("*").returns<MovimientoDeudaProveedor[]>(),
    supabase.from("contenedores").select("*").is("eliminado_en", null).order("numero", { ascending: false }).returns<Contenedor[]>(),
    supabase.from("pagos_mercancia").select("id, contenedor_id, monto_dolares, fecha_limite").eq("pagado", false).returns<{ id: string; contenedor_id: string; monto_dolares: number; fecha_limite: string | null }[]>(),
    supabase.from("envios_china").select("*").eq("estado", "PENDIENTE").order("fecha", { ascending: false }).returns<EnvioChina[]>(),
  ]);
  const proveedoresSugeridos = Array.from(new Set([...proveedoresConDeuda(deudaProveedores ?? []), ...(contenedores ?? []).map((c) => c.fabrica_principal).filter((x): x is string => Boolean(x))])).sort();
  const datosChina = {
    proveedores: proveedoresSugeridos,
    contenedores: (contenedores ?? []).map((c) => ({ id: c.id, numero: c.numero, proveedor: c.fabrica_principal })),
    abonosPendientes: abonosPendientes ?? [],
  };
  // Facturas con saldo: para poder marcar un pago "a cuenta de una factura"
  // desde el mismo registro de movimientos (sin ir a la pestaña Facturas).
  const facturasAbiertas = (facturas ?? [])
    .map((f) => ({ id: f.id, etiqueta: `${f.proveedor}${f.folio ? ` · ${f.folio}` : ""}${f.concepto ? ` · ${f.concepto}` : ""}`, saldo: saldoFactura(f, (pagosFactura ?? []).filter((p) => p.factura_id === f.id)).saldo, moneda: f.moneda }))
    .filter((f) => f.saldo > 0.01);

  const listaCuentas = cuentas ?? [];
  const listaMovimientos = movimientos ?? [];
  const cuentasPorId = new Map(listaCuentas.map((c) => [c.id, c.nombre]));
  const categoriasPorId = new Map((categorias ?? []).map((c) => [c.id, c.nombre]));

  const saldos = saldosPorCuenta(listaCuentas, listaMovimientos);
  const totalMxn = saldos.filter((s) => !s.cuenta.cuenta_transito).reduce((s, c) => s + c.saldoMxn, 0);
  const totalUsd = saldos.filter((s) => !s.cuenta.cuenta_transito).reduce((s, c) => s + c.saldoUsd, 0);
  const ultimosMovimientos = listaMovimientos.slice(0, 8);
  // Reinvertido en mercancía = todo lo que ya se le PAGÓ a proveedores
  // (abonos a la deuda con proveedores), separado por moneda. Isaac lo pidió
  // para ver de un vistazo cuánto del dinero que entró ya está trabajando en China.
  const abonosProveedor = (deudaProveedores ?? []).filter((m) => m.tipo === "ABONO");
  const reinvertidoMxn = abonosProveedor.filter((m) => m.moneda === "MXN").reduce((s, m) => s + Number(m.monto), 0);
  const reinvertidoUsd = abonosProveedor.filter((m) => m.moneda === "USD").reduce((s, m) => s + Number(m.monto), 0);

  return (
    <div className="space-y-6">
      <PendientesChina envios={enviosChina ?? []} movimientos={listaMovimientos.filter((m) => m.comision_pendiente)} nombresCuentas={Object.fromEntries(cuentasPorId)} />
      <FormularioMovimiento cuentas={listaCuentas} categorias={categorias ?? []} cuentaInicial={cuentaInicial} facturas={facturasAbiertas} china={datosChina} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Total en pesos</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">{formatoPesos(totalMxn)}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Total en dólares</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">{formatoDolares(totalUsd)}</p>
        </div>
        <div className="col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:col-span-1">
          <p className="text-xs text-emerald-800">Reinvertido en mercancía</p>
          <p className="mt-1 text-lg font-semibold text-emerald-900">{formatoDolares(reinvertidoUsd)}</p>
          {reinvertidoMxn > 0 && <p className="text-xs text-emerald-700">+ {formatoPesos(reinvertidoMxn)} pagados en pesos</p>}
          <p className="mt-1 text-[11px] text-emerald-700/80">Lo que ya les pagaste a tus proveedores (Finanzas → Proveedores)</p>
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

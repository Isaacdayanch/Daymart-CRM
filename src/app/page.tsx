import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { obtenerPerfilActual } from "@/lib/perfil";
import { resumenPorSku } from "@/lib/calculos-stock";
import { obtenerPiezasPorCajaPorSku } from "@/lib/productos-stock";
import { saldosPorCuenta } from "@/lib/calculos-financieras";
import { formatoPesos, formatoDolares } from "@/lib/formato";
import type { ConfiguracionStock, CuentaFinanciera, MovimientoFinanciero, MovimientoStock } from "@/lib/tipos";
import { MenuMas } from "./menu-mas";
import { Logo } from "@/components/logo";

const ACCESOS = [
  {
    href: "/contenedores",
    etiqueta: "Contenedores",
    icono: (
      <path
        d="M2.5 6.5 9 3l6.5 3.5v7L9 17l-6.5-3.5v-7ZM2.5 6.5 9 10l6.5-3.5M9 10v7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/stock",
    etiqueta: "Stock",
    icono: (
      <path
        d="M3 6.5 9 3l6 3.5v6L9 16l-6-3.5v-6ZM3 6.5 9 10l6-3.5M9 10v6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/finanzas",
    etiqueta: "Finanzas",
    soloDueno: true,
    icono: (
      <path
        d="M3 6a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 15 6v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 12V6ZM3 7.5h12M11 10.5h2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
];

export default async function Dashboard() {
  const supabase = await createClient();
  const perfil = await obtenerPerfilActual();
  const verDinero = perfil?.rol !== "operadora";

  const [
    { data: movimientosStock },
    { data: configuracion },
    piezasPorCajaPorSku,
    { data: cuentas },
    { data: movimientosFinancieros },
  ] = await Promise.all([
    supabase.from("movimientos_stock").select("*").returns<MovimientoStock[]>(),
    supabase.from("configuracion_stock").select("*").single<ConfiguracionStock>(),
    obtenerPiezasPorCajaPorSku(supabase),
    verDinero
      ? supabase.from("cuentas_financieras").select("*").is("eliminado_en", null).returns<CuentaFinanciera[]>()
      : Promise.resolve({ data: [] as CuentaFinanciera[] }),
    verDinero
      ? supabase.from("movimientos_financieros").select("*").returns<MovimientoFinanciero[]>()
      : Promise.resolve({ data: [] as MovimientoFinanciero[] }),
  ]);

  const resumenes = resumenPorSku(movimientosStock ?? [], configuracion?.dias_espera ?? 60, piezasPorCajaPorSku);
  const productosPorReordenar = resumenes.filter((r) => r.necesitaReorden).length;
  const valorInventario = resumenes.reduce((s, r) => s + r.valorInventario, 0);

  const saldos = verDinero ? saldosPorCuenta(cuentas ?? [], movimientosFinancieros ?? []) : [];
  const totalMxn = saldos.reduce((s, c) => s + c.saldoMxn, 0);
  const totalUsd = saldos.reduce((s, c) => s + c.saldoUsd, 0);

  const accesos = ACCESOS.filter((a) => verDinero || !a.soloDueno);

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Logo />
          <MenuMas rol={perfil?.rol} />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Bienvenido a Daymart CRM</h1>
          <p className="mt-1 text-sm text-zinc-500">Aquí tienes un vistazo rápido de todo el sistema.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-zinc-500">Valor de inventario</p>
            {verDinero ? (
              <p className="mt-2 text-3xl font-semibold text-zinc-900">{formatoPesos(valorInventario)}</p>
            ) : (
              <p className="mt-2 text-3xl font-semibold text-zinc-900">{productosPorReordenar}</p>
            )}
            <p className="mt-1 text-xs text-zinc-400">
              {verDinero
                ? `${productosPorReordenar} ${productosPorReordenar === 1 ? "producto sugerido" : "productos sugeridos"} para reordenar`
                : `${productosPorReordenar === 1 ? "producto sugerido" : "productos sugeridos"} para reordenar`}
            </p>
          </div>

          {verDinero && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-zinc-500">Saldo en Finanzas</p>
              <p className="mt-2 text-3xl font-semibold text-zinc-900">{formatoPesos(totalMxn)}</p>
              <p className="mt-1 text-xs text-zinc-400">{formatoDolares(totalUsd)} en cuentas de dólares</p>
            </div>
          )}
        </div>

        <div className="mt-8">
          <p className="mb-3 text-xs font-medium tracking-wide text-zinc-400 uppercase">Accesos rápidos</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {accesos.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300 hover:shadow-sm"
              >
                <svg width="20" height="20" viewBox="0 0 18 18" fill="none" className="shrink-0 text-zinc-400">
                  {a.icono}
                </svg>
                <span className="text-sm font-medium text-zinc-900">{a.etiqueta}</span>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

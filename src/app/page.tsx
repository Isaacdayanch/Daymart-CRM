import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { obtenerPerfilActual } from "@/lib/perfil";
import { resumenPorSku } from "@/lib/calculos-stock";
import { obtenerPiezasPorCajaPorSku } from "@/lib/productos-stock";
import { saldosPorCuenta } from "@/lib/calculos-financieras";
import { formatoPesos, formatoDolares } from "@/lib/formato";
import type { Contenedor, ConfiguracionStock, CuentaFinanciera, MovimientoFinanciero, MovimientoStock } from "@/lib/tipos";
import { MenuMas } from "./menu-mas";
import { Logo } from "@/components/logo";

export default async function Dashboard() {
  const supabase = await createClient();
  const perfil = await obtenerPerfilActual();
  const verDinero = perfil?.rol !== "operadora";

  const [
    { data: contenedores },
    { data: movimientosStock },
    { data: configuracion },
    piezasPorCajaPorSku,
    { data: cuentas },
    { data: movimientosFinancieros },
  ] = await Promise.all([
    supabase.from("contenedores").select("*").is("eliminado_en", null).returns<Contenedor[]>(),
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

  const listaContenedores = contenedores ?? [];
  const contenedoresEnTransito = listaContenedores.filter((c) => c.estado !== "RECIBIDO_BODEGA").length;

  const resumenes = resumenPorSku(movimientosStock ?? [], configuracion?.dias_espera ?? 60, piezasPorCajaPorSku);
  const productosPorReordenar = resumenes.filter((r) => r.necesitaReorden).length;

  const saldos = verDinero ? saldosPorCuenta(cuentas ?? [], movimientosFinancieros ?? []) : [];
  const totalMxn = saldos.reduce((s, c) => s + c.saldoMxn, 0);
  const totalUsd = saldos.reduce((s, c) => s + c.saldoUsd, 0);

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

        <div className="grid gap-4 sm:grid-cols-3">
          <Link
            href="/contenedores"
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-zinc-300 hover:shadow-md"
          >
            <p className="text-sm font-medium text-zinc-500">Contenedores</p>
            <p className="mt-2 text-3xl font-semibold text-zinc-900">{listaContenedores.length}</p>
            <p className="mt-1 text-xs text-zinc-400">{contenedoresEnTransito} sin llegar a bodega todavía</p>
          </Link>

          <Link
            href="/stock"
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-zinc-300 hover:shadow-md"
          >
            <p className="text-sm font-medium text-zinc-500">Stock</p>
            <p className="mt-2 text-3xl font-semibold text-zinc-900">{productosPorReordenar}</p>
            <p className="mt-1 text-xs text-zinc-400">
              {productosPorReordenar === 1 ? "producto sugerido para reordenar" : "productos sugeridos para reordenar"}
            </p>
          </Link>

          {verDinero && (
            <Link
              href="/finanzas"
              className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-zinc-300 hover:shadow-md"
            >
              <p className="text-sm font-medium text-zinc-500">Finanzas</p>
              <p className="mt-2 text-3xl font-semibold text-zinc-900">{formatoPesos(totalMxn)}</p>
              <p className="mt-1 text-xs text-zinc-400">{formatoDolares(totalUsd)} en cuentas de dólares</p>
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}

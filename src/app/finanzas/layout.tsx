import { NavFinanzas } from "./nav-finanzas";
import { Logo } from "@/components/logo";
import { obtenerPerfilActual } from "@/lib/perfil";
import { createClient } from "@/lib/supabase/server";
import { cargosPorVencer } from "@/lib/calculos-socios-deuda";
import { formatoDolares, formatoFecha, formatoPesos } from "@/lib/formato";
import type { MovimientoDeudaProveedor } from "@/lib/tipos";
import { MenuMas } from "../menu-mas";

export default async function FinanzasLayout({ children }: { children: React.ReactNode }) {
  const perfil = await obtenerPerfilActual();
  const supabase = await createClient();
  const { data: movimientosDeuda } = await supabase
    .from("movimientos_deuda_proveedor")
    .select("*")
    .returns<MovimientoDeudaProveedor[]>();

  const porVencer = cargosPorVencer(movimientosDeuda ?? [], 7);

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between">
            <div>
              <Logo />
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">Finanzas</h1>
            </div>
            <MenuMas rol={perfil?.rol} />
          </div>
          <div className="mt-4">
            <NavFinanzas />
          </div>
        </div>
      </header>

      {porVencer.length > 0 && (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto max-w-5xl px-4 py-3 text-sm text-amber-900 sm:px-6">
            <p className="font-medium">
              {porVencer.length === 1 ? "1 pago vence pronto:" : `${porVencer.length} pagos vencen pronto:`}
            </p>
            <ul className="mt-1 space-y-0.5">
              {porVencer.slice(0, 5).map(({ cargo, pendiente, vencido }) => (
                <li key={cargo.id}>
                  {cargo.proveedor} —{" "}
                  <span className="font-medium">
                    {cargo.moneda === "USD" ? formatoDolares(pendiente) : formatoPesos(pendiente)}
                  </span>{" "}
                  {vencido ? (
                    <span className="font-medium text-red-700">ya venció</span>
                  ) : (
                    <>vence {formatoFecha(cargo.fecha_limite!)}</>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

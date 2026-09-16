import { NavVentas } from "./nav-ventas";
import { Logo } from "@/components/logo";
import { obtenerPerfilActual } from "@/lib/perfil";
import { createClient } from "@/lib/supabase/server";
import { ventasConSaldo, ventasPorVencer } from "@/lib/calculos-ventas";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import type { Cliente, CobroVenta, Venta, VentaLinea } from "@/lib/tipos";
import { MenuMas } from "../menu-mas";
import Link from "next/link";

export default async function VentasLayout({ children }: { children: React.ReactNode }) {
  const perfil = await obtenerPerfilActual();
  const supabase = await createClient();
  const [{ data: ventas }, { data: lineas }, { data: cobros }, { data: clientes }] = await Promise.all([
    supabase.from("ventas").select("*").eq("forma_pago", "CREDITO").returns<Venta[]>(),
    supabase.from("venta_lineas").select("*").returns<VentaLinea[]>(),
    supabase.from("cobros_venta").select("*").returns<CobroVenta[]>(),
    supabase.from("clientes").select("*").returns<Cliente[]>(),
  ]);

  const porVencer = ventasPorVencer(ventasConSaldo(ventas ?? [], lineas ?? [], cobros ?? []), 7);
  const nombreCliente = (id: string) => clientes?.find((c) => c.id === id)?.nombre ?? "Cliente";

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur-sm print:hidden">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between">
            <div>
              <Logo />
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">Ventas</h1>
            </div>
            <MenuMas rol={perfil?.rol} />
          </div>
          <div className="mt-4">
            <NavVentas />
          </div>
        </div>
      </header>

      {porVencer.length > 0 && (
        <div className="border-b border-amber-200 bg-amber-50 print:hidden">
          <div className="mx-auto max-w-5xl px-4 py-3 text-sm text-amber-900 sm:px-6">
            <p className="font-medium">
              {porVencer.length === 1 ? "1 cobro vence pronto:" : `${porVencer.length} cobros vencen pronto:`}
            </p>
            <ul className="mt-1 space-y-0.5">
              {porVencer.slice(0, 5).map(({ venta, saldo, vencida }) => (
                <li key={venta.id}>
                  <Link href={`/ventas/${venta.id}`} className="hover:underline">
                    Venta #{venta.numero} · {nombreCliente(venta.cliente_id)}
                  </Link>{" "}
                  — <span className="font-medium">{formatoPesos(saldo)}</span>{" "}
                  {vencida ? (
                    <span className="font-medium text-red-700">ya venció</span>
                  ) : (
                    <>vence {formatoFecha(venta.fecha_limite!)}</>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 print:px-0 print:py-0">{children}</main>
    </div>
  );
}

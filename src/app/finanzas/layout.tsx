import { NavFinanzas } from "./nav-finanzas";
import { Logo } from "@/components/logo";
import { obtenerPerfilActual } from "@/lib/perfil";
import { createClient } from "@/lib/supabase/server";
import { cargosPorVencer } from "@/lib/calculos-socios-deuda";
import { ventasConSaldo, ventasPorVencer } from "@/lib/calculos-ventas";
import { formatoDolares, formatoFecha, formatoPesos } from "@/lib/formato";
import type { Cliente, CobroVenta, MovimientoDeudaProveedor, Venta, VentaLinea } from "@/lib/tipos";
import Link from "next/link";
import { MenuMas } from "../menu-mas";

export default async function FinanzasLayout({ children }: { children: React.ReactNode }) {
  const perfil = await obtenerPerfilActual();
  const supabase = await createClient();
  const [{ data: movimientosDeuda }, { data: ventas }, { data: ventaLineas }, { data: cobrosVenta }, { data: clientes }, { count: enviosChinaPendientes }, { count: comisionesPendientes }] =
    await Promise.all([
      supabase.from("movimientos_deuda_proveedor").select("*").returns<MovimientoDeudaProveedor[]>(),
      supabase.from("ventas").select("*").eq("forma_pago", "CREDITO").returns<Venta[]>(),
      supabase.from("venta_lineas").select("*").returns<VentaLinea[]>(),
      supabase.from("cobros_venta").select("*").returns<CobroVenta[]>(),
      supabase.from("clientes").select("*").returns<Cliente[]>(),
      supabase.from("envios_china").select("id", { count: "exact", head: true }).eq("estado", "PENDIENTE"),
      supabase.from("movimientos_financieros").select("id", { count: "exact", head: true }).eq("comision_pendiente", true),
    ]);
  const pendientesComision = (enviosChinaPendientes ?? 0) + (comisionesPendientes ?? 0);

  const porVencer = cargosPorVencer(movimientosDeuda ?? [], 7);
  // Lo que te deben clientes y vence pronto (o ya venció) — mismo aviso,
  // pero en verde/ámbar porque es dinero que ENTRA.
  const cobrosPorVencer = ventasPorVencer(ventasConSaldo(ventas ?? [], ventaLineas ?? [], cobrosVenta ?? []), 7);
  const nombreCliente = (id: string) => clientes?.find((c) => c.id === id)?.nombre ?? "Cliente";

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

      {pendientesComision > 0 && (
        <div className="border-b border-amber-300 bg-amber-100">
          <div className="mx-auto max-w-5xl px-4 py-2.5 text-sm text-amber-900 sm:px-6">
            <Link href="/finanzas#pendientes-china" className="font-medium underline-offset-2 hover:underline">
              Falta registrar la comisión de {pendientesComision === 1 ? "1 transacción" : `${pendientesComision} transacciones`} → ponerla ahora
            </Link>
          </div>
        </div>
      )}

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

      {cobrosPorVencer.length > 0 && (
        <div className="border-b border-sky-200 bg-sky-50">
          <div className="mx-auto max-w-5xl px-4 py-3 text-sm text-sky-900 sm:px-6">
            <p className="font-medium">
              {cobrosPorVencer.length === 1 ? "1 cliente te debe pagar pronto:" : `${cobrosPorVencer.length} clientes te deben pagar pronto:`}
            </p>
            <ul className="mt-1 space-y-0.5">
              {cobrosPorVencer.slice(0, 5).map(({ venta, saldo, vencida }) => (
                <li key={venta.id}>
                  <Link href={`/ventas/${venta.id}`} className="hover:underline">
                    {nombreCliente(venta.cliente_id)} · venta #{venta.numero}
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

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ventasConSaldo, ventasPorVencer } from "@/lib/calculos-ventas";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import type { Cliente, CobroVenta, Venta, VentaLinea } from "@/lib/tipos";

/** Aviso de cobros que vencen pronto, arriba de todas las pantallas de
 * Ventas. En `<Suspense>` dentro del layout (velocidad, 20 oct). */
export async function AvisosVentas() {
  const supabase = await createClient();
  const [{ data: ventas }, { data: lineas }, { data: cobros }, { data: clientes }] = await Promise.all([
    supabase.from("ventas").select("*").eq("forma_pago", "CREDITO").returns<Venta[]>(),
    supabase.from("venta_lineas").select("*").returns<VentaLinea[]>(),
    supabase.from("cobros_venta").select("*").returns<CobroVenta[]>(),
    supabase.from("clientes").select("*").returns<Cliente[]>(),
  ]);

  const porVencer = ventasPorVencer(ventasConSaldo(ventas ?? [], lineas ?? [], cobros ?? []), 7);
  if (!porVencer.length) return null;
  const nombreCliente = (id: string) => clientes?.find((c) => c.id === id)?.nombre ?? "Cliente";

  return (
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
  );
}

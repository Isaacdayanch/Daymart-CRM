import { createClient } from "@/lib/supabase/server";
import { ventasConSaldo } from "@/lib/calculos-ventas";
import type { Cliente, CobroVenta, Venta, VentaLinea } from "@/lib/tipos";
import { FormularioCliente } from "./formulario-cliente";
import { FilaCliente } from "./fila-cliente";

export default async function Clientes() {
  const supabase = await createClient();
  const [{ data: clientes }, { data: ventas }, { data: lineas }, { data: cobros }] = await Promise.all([
    supabase.from("clientes").select("*").is("eliminado_en", null).order("nombre").returns<Cliente[]>(),
    supabase.from("ventas").select("*").returns<Venta[]>(),
    supabase.from("venta_lineas").select("*").returns<VentaLinea[]>(),
    supabase.from("cobros_venta").select("*").returns<CobroVenta[]>(),
  ]);

  const items = ventasConSaldo(ventas ?? [], lineas ?? [], cobros ?? []);
  const lista = clientes ?? [];

  return (
    <div className="space-y-6">
      <FormularioCliente />

      {lista.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <p className="text-base font-medium text-zinc-900">Aún no tienes clientes</p>
          <p className="mt-1 text-sm text-zinc-500">Agrega uno aquí, o directo desde &ldquo;Nueva venta&rdquo;.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-xs text-zinc-400">
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-3 py-3 font-medium">Teléfono</th>
                <th className="px-3 py-3 text-right font-medium">Crédito</th>
                <th className="px-3 py-3 text-right font-medium">Ventas</th>
                <th className="px-3 py-3 text-right font-medium">Comprado</th>
                <th className="px-3 py-3 text-right font-medium">Te debe</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {lista.map((cliente) => {
                const suyas = items.filter((v) => v.venta.cliente_id === cliente.id);
                return (
                  <FilaCliente
                    key={cliente.id}
                    cliente={cliente}
                    ventas={suyas.length}
                    comprado={suyas.reduce((s, v) => s + v.total, 0)}
                    saldo={suyas.reduce((s, v) => s + Math.max(v.saldo, 0), 0)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

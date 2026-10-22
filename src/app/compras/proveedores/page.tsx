import { createClient } from "@/lib/supabase/server";
import { cargarOrdenes } from "@/lib/compras";
import { FormularioProveedor } from "./formulario-proveedor";
import { FilaProveedor } from "./fila-proveedor";

/** Catálogo de proveedores mexicanos: cómo cobran, qué les has comprado y
 * cuánto les debes (lo que debes vive en Finanzas → Facturas; aquí se suma). */
export default async function Proveedores() {
  const supabase = await createClient();
  const { ordenes, proveedores, error } = await cargarOrdenes(supabase);

  return (
    <div className="space-y-6">
      <FormularioProveedor />
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {!error && proveedores.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <p className="text-base font-medium text-zinc-900">Aún no tienes proveedores</p>
          <p className="mt-1 text-sm text-zinc-500">Agrega uno aquí, o directo desde &ldquo;Nueva orden&rdquo;.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-xs text-zinc-400">
                <th className="px-5 py-3 font-medium">Proveedor</th>
                <th className="px-3 py-3 font-medium">Contacto</th>
                <th className="px-3 py-3 font-medium">Cómo cobra</th>
                <th className="px-3 py-3 text-right font-medium">Órdenes</th>
                <th className="px-3 py-3 text-right font-medium">Comprado</th>
                <th className="px-3 py-3 text-right font-medium">Le debes</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {proveedores.map((p) => {
                const suyas = ordenes.filter((o) => o.orden.proveedor_id === p.id && o.orden.estado !== "CANCELADA");
                const ultimaFecha = suyas[0]?.orden.fecha ?? null;
                return (
                  <FilaProveedor
                    key={p.id}
                    proveedor={p}
                    ordenes={suyas.length}
                    abiertas={suyas.filter((o) => o.orden.estado === "PEDIDA" || o.orden.estado === "PARCIAL").length}
                    comprado={suyas.reduce((s, o) => s + o.recibido, 0)}
                    saldo={suyas.reduce((s, o) => s + o.saldo, 0)}
                    ultimaFecha={ultimaFecha}
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

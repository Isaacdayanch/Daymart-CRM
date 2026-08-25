import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatoPesos } from "@/lib/formato";
import type { Bodega, Contenedor, MovimientoStock } from "@/lib/tipos";

export default async function MovimientosStock() {
  const supabase = await createClient();
  const [{ data: movimientos }, { data: bodegas }, { data: contenedores }] = await Promise.all([
    supabase
      .from("movimientos_stock")
      .select("*")
      .order("creado_en", { ascending: false })
      .limit(200)
      .returns<MovimientoStock[]>(),
    supabase.from("bodegas").select("*").is("eliminado_en", null).returns<Bodega[]>(),
    supabase.from("contenedores").select("*").returns<Contenedor[]>(),
  ]);

  const listaMovimientos = movimientos ?? [];
  const bodegasPorId = new Map((bodegas ?? []).map((b) => [b.id, b.nombre]));
  const contenedoresPorId = new Map((contenedores ?? []).map((c) => [c.id, c.numero]));

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Link
          href="/stock/salidas"
          className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700"
        >
          + Registrar salidas
        </Link>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Libro de movimientos</h2>
          <p className="mt-1 text-xs text-zinc-500">Entradas, salidas y ajustes, más recientes primero.</p>
        </div>
        {listaMovimientos.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">Todavía no hay movimientos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-xs text-zinc-400">
                  <th className="px-6 py-2.5 font-medium">Fecha</th>
                  <th className="px-6 py-2.5 font-medium">Tipo</th>
                  <th className="px-6 py-2.5 font-medium">Producto</th>
                  <th className="px-6 py-2.5 font-medium">Bodega</th>
                  <th className="px-6 py-2.5 font-medium text-right">Cantidad</th>
                  <th className="px-6 py-2.5 font-medium">Origen / destino</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {listaMovimientos.map((m) => (
                  <tr key={m.id}>
                    <td className="px-6 py-3 text-xs text-zinc-500">
                      {new Date(m.creado_en).toLocaleDateString("es-MX", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          m.tipo === "ENTRADA"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                            : m.tipo === "SALIDA"
                              ? "bg-sky-50 text-sky-700 ring-sky-600/20"
                              : "bg-violet-50 text-violet-700 ring-violet-600/20"
                        }`}
                      >
                        {m.tipo === "ENTRADA" ? "Entrada" : m.tipo === "SALIDA" ? "Salida" : "Ajuste"}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2.5">
                        {m.imagen_url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- miniatura en tabla, tamaño fijo
                          <img
                            src={m.imagen_url}
                            alt={m.nombre}
                            className="h-8 w-8 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <div className="h-8 w-8 shrink-0 rounded-md bg-zinc-100" />
                        )}
                        <div>
                          <p className="font-medium text-zinc-900">{m.nombre}</p>
                          <p className="font-mono text-xs text-zinc-400">{m.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-zinc-600">{bodegasPorId.get(m.bodega_id) ?? "—"}</td>
                    <td className="px-6 py-3 text-right font-semibold text-zinc-900">
                      {m.tipo === "SALIDA" ? "-" : m.tipo === "AJUSTE" && m.cantidad < 0 ? "" : "+"}
                      {m.cantidad}
                    </td>
                    <td className="px-6 py-3 text-xs text-zinc-500">
                      {m.contenedor_id && contenedoresPorId.has(m.contenedor_id) ? (
                        <Link href={`/contenedores/${m.contenedor_id}`} className="hover:underline">
                          Contenedor {contenedoresPorId.get(m.contenedor_id)}
                        </Link>
                      ) : (
                        [m.destino, m.referencia].filter(Boolean).join(" · ") || "—"
                      )}
                      {m.tipo === "ENTRADA" && m.costo_unitario_pesos > 0 && (
                        <span className="ml-1 text-zinc-400">· {formatoPesos(m.costo_unitario_pesos)}/pza</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

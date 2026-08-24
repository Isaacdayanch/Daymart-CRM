import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resumenPorSku } from "@/lib/calculos-stock";
import { formatoPesos } from "@/lib/formato";
import type { Bodega, ConfiguracionStock, Contenedor, MovimientoStock } from "@/lib/tipos";
import { FormularioSalida } from "./formulario-salida";

export default async function MovimientosStock() {
  const supabase = await createClient();
  const [{ data: movimientos }, { data: bodegas }, { data: configuracion }, { data: contenedores }] =
    await Promise.all([
      supabase
        .from("movimientos_stock")
        .select("*")
        .order("creado_en", { ascending: false })
        .limit(200)
        .returns<MovimientoStock[]>(),
      supabase.from("bodegas").select("*").is("eliminado_en", null).returns<Bodega[]>(),
      supabase.from("configuracion_stock").select("*").single<ConfiguracionStock>(),
      supabase.from("contenedores").select("*").returns<Contenedor[]>(),
    ]);

  const listaMovimientos = movimientos ?? [];
  const listaBodegas = bodegas ?? [];
  const bodegasPorId = new Map(listaBodegas.map((b) => [b.id, b.nombre]));
  const contenedoresPorId = new Map((contenedores ?? []).map((c) => [c.id, c.numero]));

  const resumenes = resumenPorSku(listaMovimientos, configuracion?.dias_espera ?? 60).filter(
    (r) => r.stockActual > 0,
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <FormularioSalida
          opciones={resumenes.map((r) => ({ sku: r.sku, nombre: r.nombre, stockActual: r.stockActual }))}
          bodegas={listaBodegas}
        />
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Libro de movimientos</h2>
          <p className="mt-1 text-xs text-zinc-500">Entradas y salidas, más recientes primero.</p>
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
                            : "bg-sky-50 text-sky-700 ring-sky-600/20"
                        }`}
                      >
                        {m.tipo === "ENTRADA" ? "Entrada" : "Salida"}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <p className="font-medium text-zinc-900">{m.nombre}</p>
                      <p className="font-mono text-xs text-zinc-400">{m.sku}</p>
                    </td>
                    <td className="px-6 py-3 text-zinc-600">{bodegasPorId.get(m.bodega_id) ?? "—"}</td>
                    <td className="px-6 py-3 text-right font-semibold text-zinc-900">
                      {m.tipo === "ENTRADA" ? "+" : "-"}
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

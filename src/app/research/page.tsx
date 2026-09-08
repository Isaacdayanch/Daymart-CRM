import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatoPesos } from "@/lib/formato";
import type { Contenedor, ResearchProducto } from "@/lib/tipos";
import { eliminarBorrador, descartarBorrador } from "./actions";
import { ConvertirProducto } from "./convertir-producto";

export default async function Research() {
  const supabase = await createClient();
  const [{ data: borradores }, { data: contenedores }] = await Promise.all([
    supabase
      .from("research_productos")
      .select("*")
      .order("creado_en", { ascending: false })
      .returns<ResearchProducto[]>(),
    supabase
      .from("contenedores")
      .select("*")
      .is("eliminado_en", null)
      .order("numero", { ascending: false })
      .returns<Contenedor[]>(),
  ]);

  const contenedoresOpciones = (contenedores ?? []).map((c) => ({ id: c.id, numero: c.numero }));
  const pendientes = (borradores ?? []).filter((b) => b.estado === "BORRADOR");
  const yaDecididos = (borradores ?? []).filter((b) => b.estado !== "BORRADOR");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          Investiga productos antes de traerlos: margen estimado contra la comisión y el envío de Mercado
          Libre.
        </p>
        <Link
          href="/research/nueva"
          className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          + Nueva investigación
        </Link>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Borradores</h2>
        </div>
        {pendientes.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">Todavía no tienes investigaciones guardadas.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {pendientes.map((b) => (
              <div key={b.id} className="flex items-start gap-4 px-6 py-4">
                {b.imagen_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- foto jalada de Mercado Libre
                  <img src={b.imagen_url} alt={b.nombre} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="h-14 w-14 shrink-0 rounded-lg bg-zinc-100" />
                )}
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-900">{b.nombre}</p>
                      <p className="text-xs text-zinc-500">
                        {b.categoria_ml_nombre ?? "Sin categoría"} · Venta {formatoPesos(b.precio_venta)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-sm font-semibold ${
                          b.margen_estimado_pesos >= 0 ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {formatoPesos(b.margen_estimado_pesos)}{" "}
                        <span className="text-xs font-normal">({b.margen_estimado_pct.toFixed(1)}%)</span>
                      </p>
                      <div className="mt-1 flex items-center justify-end gap-3">
                        <form action={descartarBorrador.bind(null, b.id)}>
                          <button type="submit" className="text-xs font-medium text-zinc-400 hover:text-zinc-700">
                            Descartar
                          </button>
                        </form>
                        <form action={eliminarBorrador.bind(null, b.id)}>
                          <button type="submit" className="text-xs font-medium text-red-600 hover:text-red-800">
                            Quitar
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                  <ConvertirProducto
                    borradorId={b.id}
                    categoriaSugerida={b.categoria_ml_nombre}
                    contenedores={contenedoresOpciones}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {yaDecididos.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 p-6">
            <h2 className="text-sm font-semibold text-zinc-900">Convertidos / descartados</h2>
          </div>
          <div className="divide-y divide-zinc-100">
            {yaDecididos.map((b) => (
              <div key={b.id} className="flex items-center justify-between px-6 py-3 text-sm">
                <p className="text-zinc-500">{b.nombre}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                    b.estado === "CONVERTIDO"
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                      : "bg-zinc-100 text-zinc-500 ring-zinc-500/20"
                  }`}
                >
                  {b.estado === "CONVERTIDO" ? "Convertido" : "Descartado"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

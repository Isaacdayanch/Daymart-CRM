import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Contenedor, PendienteChina } from "@/lib/tipos";
import { FilaPendiente } from "./fila-pendiente";

export default async function PendientesChina() {
  const supabase = await createClient();
  const [{ data: pendientes }, { data: contenedores }] = await Promise.all([
    supabase
      .from("pendientes_china")
      .select("*")
      .eq("estado", "PENDIENTE")
      .order("creado_en", { ascending: true })
      .returns<PendienteChina[]>(),
    supabase.from("contenedores").select("*").returns<Contenedor[]>(),
  ]);

  const listaPendientes = pendientes ?? [];
  const contenedoresPorId = new Map((contenedores ?? []).map((c) => [c.id, c.numero]));

  const grupos = new Map<string, PendienteChina[]>();
  for (const p of listaPendientes) {
    const llave = p.contenedor_origen_id ?? "sin-origen";
    grupos.set(llave, [...(grupos.get(llave) ?? []), p]);
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-500">
        Mercancía que se quedó en China al recibir un contenedor incompleto. Cuando armes tu siguiente
        contenedor, elige &ldquo;¿es mercancía pendiente de China?&rdquo; al agregar un producto para
        consolidarla.
      </p>

      {listaPendientes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
          No tienes mercancía pendiente en China. 🎉
        </div>
      ) : (
        Array.from(grupos.entries()).map(([llave, items]) => (
          <div key={llave} className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-100 px-6 py-3">
              <h2 className="text-sm font-semibold text-zinc-900">
                {llave !== "sin-origen" && contenedoresPorId.has(llave) ? (
                  <Link href={`/contenedores/${llave}`} className="hover:underline">
                    Contenedor {contenedoresPorId.get(llave)}
                  </Link>
                ) : (
                  "Sin contenedor de origen"
                )}
              </h2>
            </div>
            <div className="divide-y divide-zinc-100">
              {items.map((p) => (
                <FilaPendiente key={p.id} pendiente={p} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

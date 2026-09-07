import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Contenedor, PendienteChina } from "@/lib/tipos";
import { formatoDolares } from "@/lib/formato";
import { FilaPendiente } from "./fila-pendiente";

function valorUsd(p: PendienteChina) {
  return p.precio_dolares * p.cantidad_pendiente;
}

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

  // Valor de lo ya pagado (mercancía, no incluye flete/aduana — eso no se
  // ha pagado sobre lo que sigue en China) y cuánto de eso está con cada
  // proveedor, para saber dónde tienes dinero parado.
  const pagados = listaPendientes.filter((p) => p.pagado);
  const valorPagado = pagados.reduce((suma, p) => suma + valorUsd(p), 0);
  const valorSinPagar = listaPendientes.reduce((suma, p) => suma + valorUsd(p), 0) - valorPagado;

  const porProveedor = new Map<string, number>();
  for (const p of pagados) {
    const llave = p.proveedor?.trim() || "Sin proveedor";
    porProveedor.set(llave, (porProveedor.get(llave) ?? 0) + valorUsd(p));
  }
  const proveedoresOrdenados = Array.from(porProveedor.entries()).sort((a, b) => b[1] - a[1]);

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

      {listaPendientes.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Valor pagado en China
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900">
                {formatoDolares(valorPagado)}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Solo mercancía — no incluye flete ni aduana, eso todavía no se paga sobre esto.
              </p>
            </div>
            {valorSinPagar > 0 && (
              <p className="text-xs text-zinc-400">
                Sin pagar todavía: <span className="font-medium text-zinc-600">{formatoDolares(valorSinPagar)}</span>
              </p>
            )}
          </div>

          {proveedoresOrdenados.length > 0 && (
            <div className="mt-4 grid gap-2 border-t border-zinc-100 pt-4 sm:grid-cols-2 md:grid-cols-3">
              {proveedoresOrdenados.map(([proveedor, valor]) => (
                <div
                  key={proveedor}
                  className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2 text-sm"
                >
                  <span className="text-zinc-600">{proveedor}</span>
                  <span className="font-semibold text-zinc-900">{formatoDolares(valor)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

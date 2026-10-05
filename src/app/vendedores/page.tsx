import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatoFecha } from "@/lib/formato";
import type { Vendedor } from "@/lib/tipos";
import { NuevoVendedor } from "./nuevo-vendedor";

function textoComision(v: Vendedor) {
  const partes: string[] = [];
  if (Number(v.comision_pct) > 0) partes.push(`${Number(v.comision_pct)}%`);
  if (Number(v.comision_fija) > 0) partes.push(`$${Number(v.comision_fija).toLocaleString("es-MX")} por pza`);
  return partes.length ? partes.join(" + ") : "sin comisión";
}

/** Lista de vendedores externos. Cada uno abre su ficha (datos, comisión,
 * links, cortar acceso). */
export default async function Vendedores() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("vendedores").select("*").is("eliminado_en", null).order("nombre").returns<Vendedor[]>();
  const faltaSql = Boolean(error);
  const vendedores = data ?? [];
  const activos = vendedores.filter((v) => !v.revocado_en);
  const cortados = vendedores.filter((v) => v.revocado_en);

  return (
    <div className="space-y-6">
      {faltaSql && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Falta correr el SQL 0044 en Supabase para que exista el módulo de Vendedores.
        </div>
      )}

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Vendedores externos</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Cada vendedor tiene un link privado (ve precio de venta, su comisión y piezas disponibles) y un link para sus clientes (sin precios ni cantidades). Nunca ven costos.
          </p>
        </div>
        <ul className="divide-y divide-zinc-100">
          {activos.map((v) => (
            <li key={v.id}>
              <Link href={`/vendedores/${v.id}`} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-zinc-50">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
                  {v.nombre.trim().charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900">{v.nombre}</p>
                  <p className="truncate text-xs text-zinc-500">
                    Comisión {textoComision(v)}
                    {v.telefono && ` · ${v.telefono}`}
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs text-zinc-500">
                  {v.ultimo_acceso_en ? <p>Abrió su link {formatoFecha(v.ultimo_acceso_en)}</p> : <p className="text-zinc-400">No ha abierto su link</p>}
                  {v.visitas_clientes > 0 && <p className="text-zinc-400">{v.visitas_clientes} visita(s) de sus clientes</p>}
                </div>
              </Link>
            </li>
          ))}
          {activos.length === 0 && !faltaSql && <li className="px-5 py-10 text-center text-sm text-zinc-400">Todavía no tienes vendedores. Da de alta el primero aquí abajo.</li>}
        </ul>
        <div className="border-t border-zinc-100 p-5">
          <NuevoVendedor deshabilitado={faltaSql} />
        </div>
        {cortados.length > 0 && (
          <details className="border-t border-zinc-100 px-5 py-3 text-xs text-zinc-500">
            <summary className="cursor-pointer">Con acceso cortado ({cortados.length})</summary>
            <ul className="mt-2 space-y-1">
              {cortados.map((v) => (
                <li key={v.id}>
                  <Link href={`/vendedores/${v.id}`} className="text-zinc-700 hover:underline">
                    {v.nombre}
                  </Link>{" "}
                  · cortado {formatoFecha(v.revocado_en!)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <p className="text-xs text-zinc-500">
        Los precios que ven los vendedores se capturan en{" "}
        <Link href="/vendedores/precios" className="font-medium text-zinc-700 underline-offset-2 hover:underline">
          Lista de precios
        </Link>
        . Un producto sin precio no aparece en ningún link.
      </p>
    </div>
  );
}

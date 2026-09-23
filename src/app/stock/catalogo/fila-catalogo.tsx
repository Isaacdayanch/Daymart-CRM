"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CampoSugerencias } from "@/components/campo-sugerencias";
import { Selector } from "@/components/selector";
import type { Marca, ProductoCatalogo } from "@/lib/tipos";
import { actualizarProductoCatalogo } from "./actions";

const claseCampo = "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export function FilaCatalogo({
  producto: p,
  marcas,
  categorias,
  lineas,
  stock,
}: {
  producto: ProductoCatalogo;
  marcas: Marca[];
  categorias: string[];
  lineas: string[];
  stock: number | null;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [categoria, setCategoria] = useState(p.categoria ?? "");
  const [linea, setLinea] = useState(p.linea ?? "");
  const [error, setError] = useState<string | null>(null);
  const marca = marcas.find((m) => m.id === p.marca_id);

  if (editando) {
    return (
      <li className="bg-zinc-50 p-4 sm:px-5">
        <form
          action={async (fd) => {
            setError(null);
            const r = await actualizarProductoCatalogo(p.sku, fd);
            if (r?.error) setError(r.error);
            else {
              setEditando(false);
              router.refresh();
            }
          }}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="block text-xs font-medium text-zinc-500">Nombre</label>
            <input name="nombre" defaultValue={p.nombre} required className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Marca</label>
            <div className="mt-1">
              <Selector name="marca_id" defaultValue={p.marca_id ?? ""} opciones={[{ value: "", label: "Sin marca" }, ...marcas.map((m) => ({ value: m.id, label: `${m.nombre} (${m.codigo})` }))]} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Línea (opcional)</label>
            <CampoSugerencias name="linea" value={linea} onChange={setLinea} sugerencias={lineas} className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Categoría</label>
            <CampoSugerencias name="categoria" value={categoria} onChange={setCategoria} sugerencias={categorias} className={claseCampo} />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
              Guardar
            </button>
            <button type="button" onClick={() => setEditando(false)} className="text-xs text-zinc-500 hover:text-zinc-900">
              Cancelar
            </button>
          </div>
          {error && <p className="text-xs text-red-600 lg:col-span-4">{error}</p>}
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      {p.imagen_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto del producto
        <img src={p.imagen_url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="h-12 w-12 shrink-0 rounded-lg bg-zinc-100" />
      )}
      <div className="min-w-0 flex-1">
        <Link href={`/stock/producto/${encodeURIComponent(p.sku)}`} className="block truncate text-sm font-medium text-zinc-900 hover:underline">
          {p.nombre}
        </Link>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
          <span className="font-mono text-zinc-700">{p.sku}</span>
          {marca ? (
            <span className="rounded-md bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">{marca.codigo}</span>
          ) : (
            <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700 ring-1 ring-inset ring-amber-600/20">sin marca</span>
          )}
          {p.linea && <span>· {p.linea}</span>}
          {p.categoria && <span>· {p.categoria}</span>}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums text-zinc-900">{stock === null ? "—" : `${stock.toLocaleString("es-MX")} pzas`}</p>
        <button type="button" onClick={() => setEditando(true)} className="text-[11px] text-zinc-400 hover:text-zinc-900 hover:underline">
          editar
        </button>
      </div>
    </li>
  );
}

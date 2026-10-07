"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SelectorProducto } from "@/app/stock/salidas/selector-producto";
import type { GrupoSkuMl, ProductoCrmResumen, PublicacionResumen } from "@/lib/mercadolibre-skus";
import { ligarSkuMl, quitarLigaSkuMl } from "../actions";

function Publicacion({ p }: { p: PublicacionResumen }) {
  return (
    <li className="flex items-center gap-2 text-xs text-zinc-600">
      {p.imagen_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- miniatura
        <img src={p.imagen_url} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
      ) : (
        <span className="h-8 w-8 shrink-0 rounded-md bg-zinc-100" />
      )}
      <span className="min-w-0">
        <span className="block truncate text-zinc-800">
          {p.titulo ?? p.item_id}
          {p.variacion && <span className="text-zinc-500"> · {p.variacion}</span>}
        </span>
        <span className="font-mono text-[10px] text-zinc-400">
          {p.item_id}
          {p.estado && p.estado !== "active" && <span className="ml-1 rounded bg-zinc-100 px-1 text-zinc-500">{p.estado}</span>}
          {p.logistica === "Full" && <span className="ml-1 rounded bg-emerald-50 px-1 text-emerald-700">Full</span>}
        </span>
      </span>
    </li>
  );
}

function FilaGrupo({ g, opciones }: { g: GrupoSkuMl; opciones: { sku: string; nombre: string; stockActual: number; imagenUrl: string | null }[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState(g.estado === "pendiente");
  const [elegido, setElegido] = useState(g.skuCrm ?? g.sugerencia?.sku ?? "");
  const [factor, setFactor] = useState(String(g.factor || 1));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    const r = await ligarSkuMl(g.sellerSku, elegido, Number(factor) || 1);
    setGuardando(false);
    if (r.error) setError(r.error);
    else {
      setEditando(false);
      router.refresh();
    }
  }

  const borde = g.estado === "pendiente" ? "border-amber-200 bg-amber-50/40" : "border-zinc-200 bg-white";
  return (
    <li className={`rounded-xl border p-4 ${borde}`}>
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-zinc-900 px-2 py-0.5 font-mono text-xs font-semibold text-white">{g.sellerSku}</span>
            <span className="text-[11px] text-zinc-400">
              {g.publicaciones.length} publicación(es){!g.activa && " · ninguna activa"}
            </span>
          </p>
          <ul className="mt-2 space-y-1.5">
            {g.publicaciones.map((p) => (
              <Publicacion key={p.id} p={p} />
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          {editando ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-700">
                {g.sugerencia ? (
                  <>
                    Creo que es <strong>{g.sugerencia.nombre}</strong> <span className="font-mono text-zinc-500">({g.sugerencia.sku})</span>. ¿Es correcto? Si no, elige el producto:
                  </>
                ) : (
                  "No encontré ningún producto parecido. Elige con cuál va:"
                )}
              </p>
              <SelectorProducto opciones={opciones} value={elegido} onChange={setElegido} panelClase="left-0 w-full" />
              <label className="flex items-center gap-2 text-[11px] text-zinc-600">
                Piezas del CRM por unidad de ML
                <input type="number" min={1} step={1} value={factor} onChange={(e) => setFactor(e.target.value)} className="w-14 rounded-lg border border-zinc-300 px-2 py-1 text-xs" />
                <span className="text-zinc-400">(2 si en ML se vende por par)</span>
              </label>
              <div className="flex items-center gap-2 text-xs">
                <button type="button" disabled={!elegido || guardando} onClick={guardar} className="rounded-lg bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-700 disabled:opacity-50">
                  {guardando ? "…" : g.sugerencia && elegido === g.sugerencia.sku ? "Sí, ligar con ese" : "Ligar"}
                </button>
                {g.estado !== "pendiente" && (
                  <button type="button" onClick={() => setEditando(false)} className="text-zinc-500 hover:text-zinc-900">
                    Cancelar
                  </button>
                )}
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          ) : (
            <div className="text-xs">
              <p className="text-[11px] uppercase tracking-wide text-zinc-400">Producto del CRM</p>
              <p className="font-medium text-zinc-900">{g.nombreCrm ?? g.skuCrm}</p>
              <p className="text-zinc-500">
                <span className="font-mono">{g.skuCrm}</span>
                {g.estado === "igual" ? " · mismo SKU en los dos lados" : " · ligado a mano"}
                {g.factor > 1 && <span className="font-medium text-violet-700"> · {g.factor} pzas por unidad</span>}
              </p>
              <p className="mt-1 flex gap-3">
                <button type="button" onClick={() => setEditando(true)} className="text-zinc-500 hover:text-zinc-900 hover:underline">
                  cambiar
                </button>
                {g.estado === "ligado" && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm(`¿Quitar la liga del SKU ${g.sellerSku}?`)) return;
                      const r = await quitarLigaSkuMl(g.sellerSku);
                      if (r.error) setError(r.error);
                      router.refresh();
                    }}
                    className="text-zinc-400 hover:text-red-600 hover:underline"
                  >
                    quitar
                  </button>
                )}
              </p>
              {error && <p className="text-red-600">{error}</p>}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export function TablaSkus({ grupos, sinSku, productos, pendientes }: { grupos: GrupoSkuMl[]; sinSku: PublicacionResumen[]; productos: ProductoCrmResumen[]; pendientes: number }) {
  const [filtro, setFiltro] = useState<"pendientes" | "todos">(pendientes > 0 ? "pendientes" : "todos");
  const [q, setQ] = useState("");
  const opciones = productos.map((p) => ({ sku: p.sku, nombre: p.nombre, stockActual: p.stockActual, imagenUrl: p.imagenUrl }));
  const texto = q.trim().toLowerCase();
  const visibles = grupos
    .filter((g) => filtro === "todos" || g.estado === "pendiente")
    .filter((g) => !texto || [g.sellerSku, g.skuCrm, g.nombreCrm, ...g.publicaciones.map((p) => `${p.titulo ?? ""} ${p.variacion ?? ""} ${p.item_id}`)].some((t) => t?.toLowerCase().includes(texto)));
  const ligados = grupos.filter((g) => g.estado === "ligado").length;
  const iguales = grupos.filter((g) => g.estado === "igual").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-xl border border-zinc-300 text-xs">
          {[
            { v: "pendientes" as const, t: `Pendientes (${pendientes})` },
            { v: "todos" as const, t: `Todos (${grupos.length})` },
          ].map((f) => (
            <button key={f.v} type="button" onClick={() => setFiltro(f.v)} className={`px-3.5 py-2 ${filtro === f.v ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:text-zinc-900"}`}>
              {f.t}
            </button>
          ))}
        </div>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar SKU, título o producto…" className="w-full rounded-xl border border-zinc-300 px-3.5 py-2 text-sm sm:w-80" />
        <p className="text-xs text-zinc-500">
          {iguales} con el mismo SKU en los dos lados · {ligados} ligados a mano
        </p>
      </div>

      {pendientes > 0 && filtro === "pendientes" && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Estos {pendientes} SKU(s) de Mercado Libre no coinciden con ningún producto del CRM. Te propongo el más parecido; confirma o elige el correcto.
        </p>
      )}

      <ul className="space-y-3">
        {visibles.map((g) => (
          <FilaGrupo key={g.sellerSku} g={g} opciones={opciones} />
        ))}
        {visibles.length === 0 && <li className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-400">{filtro === "pendientes" ? "Nada pendiente: todos los SKUs de ML ya resuelven a un producto." : "Nada con ese filtro."}</li>}
      </ul>

      {sinSku.length > 0 && (
        <details className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-zinc-800">
            Publicaciones sin SKU en Mercado Libre y sin liga ({sinSku.length})
          </summary>
          <p className="mt-1 text-xs text-zinc-500">
            Lo mejor es ponerles su SKU en Mercado Libre (el mismo del CRM, uno por color/variante) y quedan ligadas solas al sincronizar. Mientras, se pueden ligar una por una en{" "}
            <Link href="/mercadolibre/stock?filtro=sinligar" className="underline-offset-2 hover:underline">
              Publicaciones
            </Link>
            .
          </p>
          <ul className="mt-2 space-y-1.5">
            {sinSku.map((p) => (
              <Publicacion key={p.id} p={p} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

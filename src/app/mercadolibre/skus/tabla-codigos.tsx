"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { GrupoCodigoMl } from "@/lib/mercadolibre-codigos";
import { olvidarCodigoMl, quitarLigaCodigoMl, recordarLigaMl } from "../actions";
import { FormLigarCodigo, type OpcionProducto } from "./ligar-codigo";
import { NuevoProductoMl, type CatalogoParaNuevo } from "../stock/nuevo-producto-ml";

/** Igual que `esCodigoPendiente` del servidor (aquí sin importar código del servidor). */
const esPendiente = (g: GrupoCodigoMl) => (g.estado === "pendiente" || g.estado === "contradiccion") && g.activa && !g.ignorado;

const normalizar = (t: string | null | undefined) => (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const ORIGEN: Record<string, string> = {
  codigo: "ligado por Código ML",
  manual: "por una liga vieja de la publicación",
  sku: "por una liga vieja del SKU de ML",
  auto: "porque el SKU de ML es igual al del CRM",
};

/** Un renglón = un Código ML de Full = un producto físico de ML. */
function FilaCodigo({ g, opciones, claveOlvido, catalogo }: { g: GrupoCodigoMl; opciones: OpcionProducto[]; claveOlvido: string; catalogo?: CatalogoParaNuevo }) {
  const router = useRouter();
  const [editando, setEditando] = useState(g.estado === "pendiente" || g.estado === "contradiccion");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const principal = g.publicaciones.find((p) => !p.catalogo) ?? g.publicaciones[0];
  const fondo = g.estado === "contradiccion" ? "border-red-200 bg-red-50/40" : g.estado === "pendiente" ? "border-amber-200 bg-amber-50/30" : "border-zinc-200 bg-white";
  const producto = g.skuCrm ? opciones.find((o) => o.sku === g.skuCrm) : undefined;

  return (
    <li className={`rounded-xl border p-3 ${fondo}`}>
      <div className="flex flex-wrap items-start gap-3">
        {g.imagenUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- miniatura de ML
          <img src={g.imagenUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="h-14 w-14 shrink-0 rounded-lg bg-zinc-100" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-900">{g.titulo}</p>
          <p className="text-xs text-zinc-500">
            Código ML <span className="font-mono font-medium text-zinc-800">{g.inventoryId}</span>
            {g.sellerSku && <> · SKU ML {g.sellerSku}</>}
            {" · "}
            {g.enFull > 0 ? <span className="text-emerald-700">{g.enFull.toLocaleString("es-MX")} en Full</span> : <span className="text-zinc-400">0 en Full</span>}
            {!g.activa && <span className="ml-1 rounded bg-zinc-100 px-1 text-zinc-500">pausada/finalizada</span>}
          </p>
          <p className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
            {g.publicaciones.map((p) => (
              <span key={`${p.item_id}-${p.variation_id ?? 0}`} className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-zinc-500">
                {p.item_id}
                {p.catalogo && " · catálogo"}
                {p.estado && p.estado !== "active" && ` · ${p.estado}`}
              </span>
            ))}
          </p>
        </div>

        <div className="w-full sm:w-80">
          {g.estado === "contradiccion" && (
            <p className="mb-1 text-xs text-red-700">
              Sus publicaciones caen en productos distintos:{" "}
              {g.candidatos.map((c, i) => (
                <span key={c.sku}>
                  {i > 0 && " y "}
                  <strong>{c.nombre ?? c.sku}</strong> <span className="font-mono">({c.sku})</span>
                </span>
              ))}
              . Es el mismo producto físico: elige cuál es.
            </p>
          )}
          {g.skuCrm && !editando && (
            <div className="text-xs">
              <p className="font-medium text-zinc-900">
                → {g.nombreCrm ?? producto?.nombre ?? g.skuCrm} <span className="font-mono font-normal text-zinc-500">{g.skuCrm}</span>
              </p>
              <p className="text-zinc-400">
                {ORIGEN[g.origen ?? ""] ?? ""}
                {g.factor > 1 && <span className="font-medium text-violet-700"> · {g.factor} pzas por unidad</span>}
                {producto && <> · {producto.stockActual.toLocaleString("es-MX")} en bodega</>}
                {" · "}
                <button type="button" onClick={() => setEditando(true)} className="text-zinc-600 hover:text-zinc-900">
                  {g.estado === "heredado" ? "confirmar o cambiar" : "cambiar"}
                </button>
                {g.estado === "ligado" && (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`¿Quitar la liga del Código ML ${g.inventoryId}? Sus ventas y envíos a Full dejarán de descontar de tu bodega hasta que lo vuelvas a ligar.`)) return;
                        const r = await quitarLigaCodigoMl(g.inventoryId);
                        if (r.error) setError(r.error);
                        router.refresh();
                      }}
                      className="hover:text-red-600"
                    >
                      quitar
                    </button>
                  </>
                )}
              </p>
            </div>
          )}
          {editando && (
            <>
              {g.sugerencia && !g.skuCrm && (
                <p className="mb-1 text-xs text-zinc-700">
                  Creo que es <strong>{g.sugerencia.nombre}</strong> <span className="font-mono text-zinc-500">({g.sugerencia.sku})</span>. ¿Es correcto?
                </p>
              )}
              <FormLigarCodigo
                inventoryId={g.inventoryId}
                opciones={opciones}
                inicial={g.skuCrm ?? g.sugerencia?.sku ?? null}
                factorInicial={g.factor}
                alLigar={() => {
                  setEditando(false);
                  router.refresh();
                }}
                alCancelar={g.skuCrm ? () => setEditando(false) : undefined}
              />
              {catalogo && !creando && (
                <button type="button" onClick={() => setCreando(true)} className="mt-1 text-xs text-emerald-700 underline-offset-2 hover:underline">
                  ¿No está en Stock todavía? + Nuevo producto con estos datos
                </button>
              )}
            </>
          )}
          {!g.skuCrm && (
            <p className="mt-1 text-right text-[11px]">
              {g.ignorado ? (
                <button
                  type="button"
                  onClick={async () => {
                    await recordarLigaMl(claveOlvido);
                    router.refresh();
                  }}
                  className="text-zinc-500 hover:text-zinc-900 hover:underline"
                >
                  volver a mostrar como pendiente
                </button>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm(`¿Olvidar "${g.titulo}"? Deja de aparecer como pendiente. Lo puedes volver a mostrar desde "Olvidados".`)) return;
                    const r = await olvidarCodigoMl(g.inventoryId, g.titulo);
                    if (r.error) setError(r.error);
                    router.refresh();
                  }}
                  className="text-zinc-400 hover:text-zinc-800 hover:underline"
                >
                  olvidar este producto
                </button>
              )}
            </p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
      {creando && catalogo && principal && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
          <NuevoProductoMl
            datos={{
              itemId: principal.item_id,
              variationId: principal.variation_id,
              titulo: principal.titulo,
              variacion: principal.variacion,
              imagenUrl: g.imagenUrl,
              sellerSku: null,
              otras: g.publicaciones.filter((p) => p !== principal).map((p) => ({ itemId: p.item_id, variationId: p.variation_id })),
            }}
            catalogo={catalogo}
            alCerrar={() => setCreando(false)}
          />
        </div>
      )}
    </li>
  );
}

/** Ligar por Código ML: lo pendiente arriba (contradicciones primero),
 * buscador sin acentos sobre título, código, SKU y publicaciones. */
export function TablaCodigos({ grupos, opciones, clavesOlvido, qInicial = "", catalogo }: { grupos: GrupoCodigoMl[]; opciones: OpcionProducto[]; clavesOlvido: Record<string, string>; qInicial?: string; catalogo?: CatalogoParaNuevo }) {
  const pendientes = grupos.filter(esPendiente);
  const [filtro, setFiltro] = useState<"pendientes" | "todos">(qInicial || pendientes.length === 0 ? "todos" : "pendientes");
  const [q, setQ] = useState(qInicial);

  const visibles = useMemo(() => {
    const t = normalizar(q.trim());
    if (t) {
      return grupos.filter((g) =>
        normalizar([g.titulo, g.inventoryId, g.sellerSku, g.skuCrm, g.nombreCrm, ...g.publicaciones.map((p) => `${p.item_id} ${p.titulo ?? ""} ${p.variacion ?? ""} ${p.seller_sku ?? ""}`)].join(" ")).includes(t),
      );
    }
    if (filtro === "pendientes") return pendientes;
    return grupos.filter((g) => !g.ignorado && (g.activa || g.skuCrm));
  }, [grupos, pendientes, filtro, q]);

  const inactivas = grupos.filter((g) => !g.activa && !g.skuCrm && !g.ignorado);
  const olvidados = grupos.filter((g) => g.ignorado && !g.skuCrm);
  const ligados = grupos.filter((g) => g.skuCrm).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["pendientes", `Por ligar (${pendientes.length})`],
            ["todos", `Todos (${ligados} ligados de ${grupos.length})`],
          ] as const
        ).map(([v, t]) => (
          <button
            key={v}
            type="button"
            onClick={() => setFiltro(v)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset ${filtro === v && !q ? "bg-zinc-900 text-white ring-zinc-900" : "bg-white text-zinc-600 ring-zinc-300 hover:bg-zinc-50"}`}
          >
            {t}
          </button>
        ))}
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: nombre, Código ML, SKU o MLM…" className="ml-auto w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm sm:w-72" />
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-400">
          {q ? "Nada coincide con esa búsqueda. Si es una publicación nueva, dale “Actualizar desde Mercado Libre” arriba." : filtro === "pendientes" ? "Todo lo que está en Full ya está ligado." : "No hay productos en Full."}
        </p>
      ) : (
        <ul className="space-y-2">
          {visibles.map((g) => (
            <FilaCodigo key={g.inventoryId} g={g} opciones={opciones} claveOlvido={clavesOlvido[g.inventoryId] ?? ""} catalogo={catalogo} />
          ))}
        </ul>
      )}

      {!q && inactivas.length > 0 && (
        <details className="group rounded-2xl border border-zinc-200 bg-zinc-50/60">
          <summary className="cursor-pointer select-none px-5 py-3 text-sm text-zinc-500 hover:text-zinc-800">
            <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
            Pausadas o finalizadas sin ligar ({inactivas.length})
          </summary>
          <ul className="space-y-2 px-2 pb-2">
            {inactivas.map((g) => (
              <FilaCodigo key={g.inventoryId} g={g} opciones={opciones} claveOlvido={clavesOlvido[g.inventoryId] ?? ""} catalogo={catalogo} />
            ))}
          </ul>
        </details>
      )}
      {!q && olvidados.length > 0 && (
        <details className="group rounded-2xl border border-zinc-200 bg-zinc-50/60">
          <summary className="cursor-pointer select-none px-5 py-3 text-sm text-zinc-500 hover:text-zinc-800">
            <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
            Olvidados ({olvidados.length})
          </summary>
          <ul className="space-y-2 px-2 pb-2">
            {olvidados.map((g) => (
              <FilaCodigo key={g.inventoryId} g={g} opciones={opciones} claveOlvido={clavesOlvido[g.inventoryId] ?? ""} catalogo={catalogo} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

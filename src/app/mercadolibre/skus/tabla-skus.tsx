"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SelectorProducto } from "@/app/stock/salidas/selector-producto";
import { esPendienteReal, esPublicacionPendienteReal, type GrupoSkuMl, type ProductoCrmResumen, type PublicacionResumen } from "@/lib/mercadolibre-skus";
import type { LigaIgnorada } from "@/lib/mercadolibre-stock";
import { desvincularPublicacion, ligarSkuMl, ligarVariante, olvidarPublicacionMl, olvidarSkuMl, quitarLigaSkuMl, recordarLigaMl } from "../actions";

type Opcion = { sku: string; nombre: string; stockActual: number; imagenUrl: string | null };

function Foto({ p }: { p: PublicacionResumen }) {
  return p.imagen_url ? (
    // eslint-disable-next-line @next/next/no-img-element -- miniatura
    <img src={p.imagen_url} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
  ) : (
    <span className="h-9 w-9 shrink-0 rounded-md bg-zinc-100" />
  );
}

function Publicacion({ p }: { p: PublicacionResumen }) {
  return (
    <li className="flex items-center gap-2 text-xs text-zinc-600">
      <Foto p={p} />
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

function CampoFactor({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-600">
      Piezas del CRM por unidad de ML
      <input type="number" min={1} step={1} value={valor} onChange={(e) => onChange(e.target.value)} className="w-14 rounded-lg border border-zinc-300 px-2 py-1 text-xs" />
      <span className="text-zinc-400">(solo si en tu bodega cuentas piezas sueltas y ML lo vende en paquete, ej. mancuernas = 2; si en tu stock ya cuentas el paquete, ej. yoga blocks en par, déjalo en 1)</span>
    </label>
  );
}

/** "Olvidar este producto": deja de aparecer como pendiente (no se borra nada). */
function BotonOlvidar({ titulo, onOlvidar }: { titulo: string; onOlvidar: () => Promise<{ error: string | null }> }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          if (!window.confirm(`¿Olvidar "${titulo}"? Deja de aparecer como pendiente de ligar. Lo puedes volver a mostrar desde "Olvidados", abajo.`)) return;
          const r = await onOlvidar();
          if (r.error) setError(r.error);
          router.refresh();
        }}
        className="text-zinc-400 hover:text-zinc-800 hover:underline"
      >
        olvidar este producto
      </button>
      {error && <span className="text-red-600"> {error}</span>}
    </>
  );
}

/** Una variante (color/talla) ligada por su cuenta. `permitirOlvidar` solo
 * para publicaciones sin SKU en ML (las que sí tienen SKU se olvidan por SKU). */
function FilaVariante({ p, opciones, permitirOlvidar = false }: { p: PublicacionResumen; opciones: Opcion[]; permitirOlvidar?: boolean }) {
  const router = useRouter();
  const propia = p.origen === "manual";
  const [editando, setEditando] = useState(!p.skuCrm);
  const [elegido, setElegido] = useState(p.skuCrm ?? p.sugerencia?.sku ?? "");
  const [factor, setFactor] = useState(String(p.factor || 1));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    const r = await ligarVariante(p.item_id, p.variation_id, elegido, Number(factor) || 1);
    setGuardando(false);
    if (r.error) setError(r.error);
    else {
      setEditando(false);
      router.refresh();
    }
  }

  return (
    <li className={`rounded-lg border p-3 ${p.skuCrm ? "border-zinc-200 bg-white" : "border-amber-200 bg-amber-50/60"}`}>
      <div className="flex items-start gap-2">
        <Foto p={p} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-zinc-800">
            {p.titulo ?? p.item_id}
            {p.variacion && <strong className="text-zinc-900"> · {p.variacion}</strong>}
          </p>
          <p className="font-mono text-[10px] text-zinc-400">{p.item_id}</p>
          {editando ? (
            <div className="mt-2 space-y-2">
              {p.sugerencia && (
                <p className="text-xs text-zinc-700">
                  Creo que es <strong>{p.sugerencia.nombre}</strong> <span className="font-mono text-zinc-500">({p.sugerencia.sku})</span>. ¿Es correcto?
                </p>
              )}
              <SelectorProducto opciones={opciones} value={elegido} onChange={setElegido} panelClase="left-0 w-full" />
              <CampoFactor valor={factor} onChange={setFactor} />
              <div className="flex items-center gap-2 text-xs">
                <button type="button" disabled={!elegido || guardando} onClick={guardar} className="rounded-lg bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-700 disabled:opacity-50">
                  {guardando ? "…" : p.sugerencia && elegido === p.sugerencia.sku ? "Sí, ligar esta variante" : "Ligar esta variante"}
                </button>
                {p.skuCrm && (
                  <button type="button" onClick={() => setEditando(false)} className="text-zinc-500 hover:text-zinc-900">
                    Cancelar
                  </button>
                )}
                {permitirOlvidar && !p.skuCrm && <BotonOlvidar titulo={`${p.titulo ?? p.item_id}${p.variacion ? ` · ${p.variacion}` : ""}`} onOlvidar={() => olvidarPublicacionMl(p.item_id, p.variation_id, [p.titulo, p.variacion].filter(Boolean).join(" · "))} />}
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          ) : (
            <p className="mt-1 text-xs text-zinc-600">
              → <span className="font-medium text-zinc-900">{p.nombreCrm ?? p.skuCrm}</span> <span className="font-mono text-zinc-400">{p.skuCrm}</span>
              {propia ? <span className="text-zinc-400"> · liga propia de esta variante</span> : p.origen === "sku" ? <span className="text-zinc-400"> · hereda la liga del SKU</span> : <span className="text-zinc-400"> · mismo SKU</span>}
              {p.factor > 1 && <span className="font-medium text-violet-700"> · {p.factor} pzas por unidad</span>}
              {" · "}
              <button type="button" onClick={() => setEditando(true)} className="text-zinc-500 hover:text-zinc-900 hover:underline">
                cambiar
              </button>
              {propia && (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await desvincularPublicacion(p.item_id, p.variation_id);
                      if (r.error) setError(r.error);
                      router.refresh();
                    }}
                    className="text-zinc-400 hover:text-red-600 hover:underline"
                  >
                    quitar liga propia
                  </button>
                </>
              )}
              {error && <span className="block text-red-600">{error}</span>}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function FilaGrupo({ g, opciones }: { g: GrupoSkuMl; opciones: Opcion[] }) {
  const router = useRouter();
  const tienePropias = g.publicaciones.some((p) => p.origen === "manual");
  // Con variantes (colores/tallas) se liga cada una por separado por defecto.
  const [porVariante, setPorVariante] = useState(g.conVariantes);
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
  const encabezado = (
    <p className="flex flex-wrap items-center gap-2">
      <span className="rounded-md bg-zinc-900 px-2 py-0.5 font-mono text-xs font-semibold text-white">{g.sellerSku}</span>
      <span className="text-[11px] text-zinc-400">
        {g.publicaciones.length} publicación(es){!g.activa && " · ninguna activa"}
      </span>
      {g.conVariantes && (
        <button type="button" onClick={() => setPorVariante((v) => !v)} className="text-[11px] text-[#2D3277] underline-offset-2 hover:underline">
          {porVariante ? "ligar todo el SKU a un solo producto" : "ligar cada variante por separado"}
        </button>
      )}
      {g.estado === "pendiente" && !g.ignorado && (
        <span className="text-[11px]">
          <BotonOlvidar titulo={`${g.publicaciones[0]?.titulo ?? g.sellerSku} (${g.sellerSku})`} onOlvidar={() => olvidarSkuMl(g.sellerSku, g.publicaciones[0]?.titulo ?? null)} />
        </span>
      )}
    </p>
  );

  if (porVariante) {
    return (
      <li className={`rounded-xl border p-4 ${borde}`}>
        {encabezado}
        <p className="mt-1 text-[11px] text-zinc-500">Cada color/variante se liga a su propio producto del CRM. Esa liga manda sobre la del SKU.</p>
        <ul className="mt-2 space-y-2">
          {g.publicaciones.map((p) => (
            <FilaVariante key={p.id} p={p} opciones={opciones} />
          ))}
        </ul>
      </li>
    );
  }

  return (
    <li className={`rounded-xl border p-4 ${borde}`}>
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="min-w-0">
          {encabezado}
          <ul className="mt-2 space-y-1.5">
            {g.publicaciones.map((p) => (
              <Publicacion key={p.id} p={p} />
            ))}
          </ul>
          {tienePropias && <p className="mt-2 text-[11px] text-amber-700">Algunas variantes tienen liga propia: esas mandan sobre la liga del SKU.</p>}
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
              <CampoFactor valor={factor} onChange={setFactor} />
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
              <p className="font-medium text-zinc-900">{g.nombreCrm ?? g.skuCrm ?? "—"}</p>
              <p className="text-zinc-500">
                <span className="font-mono">{g.skuCrm}</span>
                {g.estado === "igual" ? " · mismo SKU en los dos lados" : " · ligado a mano"}
                {g.factor > 1 && <span className="font-medium text-violet-700"> · {g.factor} pzas por unidad</span>}
              </p>
              <p className="mt-1 flex gap-3">
                <button type="button" onClick={() => setEditando(true)} className="text-zinc-500 hover:text-zinc-900 hover:underline">
                  cambiar
                </button>
                {g.estado === "ligado" && g.skuCrm && (
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

export function TablaSkus({
  grupos,
  sinSku,
  productos,
  pendientes,
  ignorados,
  qInicial = "",
}: {
  grupos: GrupoSkuMl[];
  sinSku: PublicacionResumen[];
  productos: ProductoCrmResumen[];
  pendientes: number;
  ignorados: LigaIgnorada[];
  qInicial?: string;
}) {
  const router = useRouter();
  // Si llega con búsqueda (ej. desde la vista previa de un envío), se muestran todos los grupos que coincidan.
  const [filtro, setFiltro] = useState<"pendientes" | "todos">(pendientes > 0 && !qInicial ? "pendientes" : "todos");
  const [q, setQ] = useState(qInicial);
  const [errorOlvidados, setErrorOlvidados] = useState<string | null>(null);
  const opciones: Opcion[] = productos.map((p) => ({ sku: p.sku, nombre: p.nombre, stockActual: p.stockActual, imagenUrl: p.imagenUrl }));
  const texto = q.trim().toLowerCase();
  const coincideGrupo = (g: GrupoSkuMl) => !texto || [g.sellerSku, g.skuCrm, g.nombreCrm, ...g.publicaciones.map((p) => `${p.titulo ?? ""} ${p.variacion ?? ""} ${p.item_id} ${p.skuCrm ?? ""}`)].some((t) => t?.toLowerCase().includes(texto));
  const coincidePub = (p: PublicacionResumen) => !texto || `${p.titulo ?? ""} ${p.variacion ?? ""} ${p.item_id} ${p.skuCrm ?? ""} ${p.nombreCrm ?? ""}`.toLowerCase().includes(texto);

  // Grupos: lo pendiente de verdad arriba; lo inactivo y lo olvidado aparte.
  const gruposVivos = grupos.filter((g) => !g.ignorado);
  const inactivosPendientes = gruposVivos.filter((g) => g.estado === "pendiente" && !g.activa && coincideGrupo(g));
  const visibles = gruposVivos.filter((g) => (filtro === "todos" ? true : esPendienteReal(g))).filter(coincideGrupo).filter((g) => filtro === "todos" || !inactivosPendientes.includes(g));
  const olvidadosGrupos = grupos.filter((g) => g.ignorado && coincideGrupo(g));
  // Publicaciones sin SKU en ML: con búsqueda se muestran en la lista principal, para que nada "desaparezca".
  const sinSkuVivas = sinSku.filter((p) => !p.ignorado);
  const sinSkuCoinciden = texto ? sinSkuVivas.filter(coincidePub) : [];
  const sinSkuPendientes = sinSkuVivas.filter(esPublicacionPendienteReal);
  const sinSkuInactivas = sinSkuVivas.filter((p) => !p.skuCrm && p.estado !== "active");
  const olvidadasPubs = sinSku.filter((p) => p.ignorado && coincidePub(p));
  const ligados = grupos.filter((g) => g.estado === "ligado").length;
  const iguales = grupos.filter((g) => g.estado === "igual").length;
  const totalInactivos = inactivosPendientes.length + sinSkuInactivas.length;
  const totalOlvidados = ignorados.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-xl border border-zinc-300 text-xs">
          {[
            { v: "pendientes" as const, t: `Pendientes (${pendientes})` },
            { v: "todos" as const, t: `Todos (${gruposVivos.length})` },
          ].map((f) => (
            <button key={f.v} type="button" onClick={() => setFiltro(f.v)} className={`px-3.5 py-2 ${filtro === f.v ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:text-zinc-900"}`}>
              {f.t}
            </button>
          ))}
        </div>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar SKU, título o producto…" className="w-full rounded-xl border border-zinc-300 px-3.5 py-2 text-sm sm:w-80" />
        <p className="text-xs text-zinc-500">
          {iguales} con el mismo SKU en los dos lados · {ligados} ligados a mano · {sinSkuVivas.length} sin SKU en ML
        </p>
      </div>

      {pendientes > 0 && filtro === "pendientes" && !texto && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Estos {pendientes} producto(s) activos en Mercado Libre no resuelven a ningún producto del CRM. Te propongo el más parecido; confirma o elige el correcto. Si una publicación trae varios colores, cada color se liga por separado. Lo que no te interese ligar, dale “olvidar este producto”.
        </p>
      )}

      <ul className="space-y-3">
        {visibles.map((g) => (
          <FilaGrupo key={g.sellerSku} g={g} opciones={opciones} />
        ))}
        {texto && sinSkuCoinciden.length > 0 && (
          <li className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
            <p className="text-xs font-medium text-zinc-700">Publicaciones sin SKU en Mercado Libre que coinciden con “{q.trim()}” ({sinSkuCoinciden.length})</p>
            <ul className="mt-2 space-y-2">
              {sinSkuCoinciden.map((p) => (
                <FilaVariante key={p.id} p={p} opciones={opciones} permitirOlvidar />
              ))}
            </ul>
          </li>
        )}
        {filtro === "pendientes" && !texto && sinSkuPendientes.length > 0 && (
          <li className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
            <p className="text-xs font-medium text-zinc-800">Publicaciones activas sin SKU en Mercado Libre, sin ligar ({sinSkuPendientes.length})</p>
            <p className="mt-1 text-[11px] text-zinc-500">Lo mejor es ponerles su SKU en Mercado Libre (el mismo del CRM, uno por color) y quedan ligadas solas al sincronizar. Mientras, lígalas aquí u “olvídalas”.</p>
            <ul className="mt-2 space-y-2">
              {sinSkuPendientes.map((p) => (
                <FilaVariante key={p.id} p={p} opciones={opciones} permitirOlvidar />
              ))}
            </ul>
          </li>
        )}
        {visibles.length === 0 && sinSkuCoinciden.length === 0 && (filtro !== "pendientes" || texto || sinSkuPendientes.length === 0) && (
          <li className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-400">
            {texto ? (
              <>
                Nada coincide con “{q.trim()}”. Si la publicación sí existe en Mercado Libre, dale “Actualizar desde Mercado Libre” arriba y vuelve a buscar; si es inactiva u olvidada, revisa las listas de abajo.
              </>
            ) : filtro === "pendientes" ? (
              "Nada pendiente: todo lo activo en Mercado Libre ya resuelve a un producto."
            ) : (
              "Nada con ese filtro."
            )}
          </li>
        )}
      </ul>

      {filtro === "todos" && !texto && sinSkuVivas.length > 0 && (
        <details className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-zinc-800">
            Publicaciones sin SKU en Mercado Libre ({sinSkuVivas.length}; {sinSkuVivas.filter((p) => !p.skuCrm).length} sin ligar)
          </summary>
          <p className="mt-1 text-xs text-zinc-500">Lo mejor es ponerles su SKU en Mercado Libre (el mismo del CRM, uno por color/variante) y quedan ligadas solas al sincronizar.</p>
          <ul className="mt-2 space-y-2">
            {sinSkuVivas.map((p) => (
              <FilaVariante key={p.id} p={p} opciones={opciones} permitirOlvidar />
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-zinc-400">
            También puedes ligarlas desde{" "}
            <Link href="/mercadolibre/stock?filtro=sinligar" className="underline-offset-2 hover:underline">
              Publicaciones
            </Link>
            .
          </p>
        </details>
      )}

      {totalInactivos > 0 && (
        <details className="rounded-xl border border-zinc-200 bg-zinc-50/60 px-4 py-3">
          <summary className="cursor-pointer text-sm text-zinc-600 hover:text-zinc-900">
            Publicaciones inactivas sin ligar ({totalInactivos}) · pausadas o finalizadas: no estorban, pero aquí están por si las reactivas
          </summary>
          <ul className="mt-2 space-y-3">
            {inactivosPendientes.map((g) => (
              <FilaGrupo key={g.sellerSku} g={g} opciones={opciones} />
            ))}
            {sinSkuInactivas.map((p) => (
              <FilaVariante key={p.id} p={p} opciones={opciones} permitirOlvidar />
            ))}
          </ul>
        </details>
      )}

      {totalOlvidados > 0 && (
        <details className="rounded-xl border border-zinc-200 bg-zinc-50/60 px-4 py-3">
          <summary className="cursor-pointer text-sm text-zinc-600 hover:text-zinc-900">Olvidados ({totalOlvidados}) · no te interesa ligarlos por ahora</summary>
          <ul className="mt-2 divide-y divide-zinc-100 text-xs">
            {ignorados
              .filter((i) => {
                if (!texto) return true;
                const g = olvidadosGrupos.find((x) => x.sellerSku === i.seller_sku);
                const p = olvidadasPubs.find((x) => x.item_id === i.item_id && (x.variation_id ?? null) === (i.variation_id ?? null));
                return Boolean(g || p) || `${i.titulo ?? ""} ${i.seller_sku ?? ""} ${i.item_id ?? ""}`.toLowerCase().includes(texto);
              })
              .map((i) => (
                <li key={i.clave} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span className="text-zinc-700">
                    {i.titulo ?? i.seller_sku ?? i.item_id}
                    {i.seller_sku && <span className="ml-2 rounded-md bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-white">{i.seller_sku}</span>}
                    {!i.seller_sku && i.item_id && <span className="ml-2 font-mono text-[10px] text-zinc-400">{i.item_id}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await recordarLigaMl(i.clave);
                      if (r.error) setErrorOlvidados(r.error);
                      router.refresh();
                    }}
                    className="text-[#2D3277] underline-offset-2 hover:underline"
                  >
                    volver a mostrar
                  </button>
                </li>
              ))}
          </ul>
          {errorOlvidados && <p className="mt-1 text-xs text-red-600">{errorOlvidados}</p>}
        </details>
      )}
    </div>
  );
}

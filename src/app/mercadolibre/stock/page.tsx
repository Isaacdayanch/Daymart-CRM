import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { obtenerConexion } from "@/lib/mercadolibre-auth";
import { obtenerEstadoSync } from "@/lib/mercadolibre-ordenes";
import {
  claveVinculo,
  ESTADOS_PUBLICACION,
  obtenerPublicaciones,
  obtenerVinculos,
  resumenFull,
  skuCrmDe,
  type PublicacionMl,
} from "@/lib/mercadolibre-stock";
import { resumenPorSku, valorTotalInventario } from "@/lib/calculos-stock";
import { obtenerPiezasPorCajaPorSku } from "@/lib/productos-stock";
import { formatoFechaHoraMx } from "@/lib/fechas-mx";
import { formatoPesos } from "@/lib/formato";
import type { ConfiguracionStock, MovimientoStock } from "@/lib/tipos";
import { BotonSincronizarStock } from "./boton-sincronizar-stock";
import { LigaProducto } from "./liga-producto";

// Las llamadas a Mercado Libre pueden tardar: se sube el tope de tiempo de Vercel (máx. 60 s en plan Hobby).
export const maxDuration = 60;

/** Valor de lo que hay en esa publicación a precio de venta: precio × piezas
 * (las que tiene Full si está en Full; si no, las publicadas). Es lo que
 * decide el orden de la lista — así mil piezas de algo barato no le ganan a
 * pocas piezas de algo caro que en total vale más. */
/** Un producto en la lista: su publicación principal (la tradicional), las
 * demás que comparten su stock (catálogo), y la liga con el CRM. */
interface GrupoPublicacion {
  principal: PublicacionMl;
  otras: PublicacionMl[];
  liga: { sku: string | null; origen: "manual" | "auto" | null; de: PublicacionMl };
  activo: boolean;
  full: boolean;
}

function valorPublicacion(p: PublicacionMl) {
  const piezas = p.full_disponible ?? p.cantidad_publicada ?? 0;
  return (p.precio ?? 0) * piezas;
}

export default async function StockMercadoLibre({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; q?: string; separadas?: string }>;
}) {
  const { filtro = "todas", q = "", separadas = "" } = await searchParams;
  const verSeparadas = separadas === "1";
  const supabase = await createClient();
  const conexion = await obtenerConexion().catch(() => null);

  const [{ data: movimientos }, { data: configuracion }, piezasPorCajaPorSku] = await Promise.all([
    supabase.from("movimientos_stock").select("*").returns<MovimientoStock[]>(),
    supabase.from("configuracion_stock").select("*").single<ConfiguracionStock>(),
    obtenerPiezasPorCajaPorSku(supabase),
  ]);
  const resumenes = resumenPorSku(movimientos ?? [], configuracion?.dias_espera ?? 60, piezasPorCajaPorSku);
  const skusCrm = new Set(resumenes.map((r) => r.sku));
  const costoPorSku = new Map(resumenes.map((r) => [r.sku, r.costoPromedio]));
  const nombrePorSku = new Map(resumenes.map((r) => [r.sku, r.nombre]));
  const piezasBodega = resumenes.reduce((s, r) => s + r.stockActual, 0);
  const valorBodega = valorTotalInventario(resumenes);

  let publicaciones: PublicacionMl[] = [];
  let vinculos = new Map<string, string>();
  let sync = null;
  let errorLectura: string | null = null;
  try {
    const [pubs, vins] = await Promise.all([obtenerPublicaciones(), obtenerVinculos()]);
    publicaciones = pubs;
    vinculos = new Map(vins.map((v) => [claveVinculo(v.item_id, v.variation_id), v.sku_crm]));
    sync = await obtenerEstadoSync();
  } catch (e) {
    errorLectura = e instanceof Error ? e.message : "No se pudieron leer las publicaciones.";
  }

  const full = resumenFull(publicaciones, vinculos, skusCrm, costoPorSku);

  // Un renglón por PRODUCTO, no por publicación: la tradicional y su
  // publicación de catálogo comparten el mismo stock (mismo inventory_id en
  // Full, o ligadas por relacion_item_id fuera de Full), así que se juntan
  // en un solo renglón — la tradicional manda y la de catálogo se anota
  // chiquito. Isaac no quería ver dos de cada uno. `?separadas=1` las
  // vuelve a mostrar una por una.
  const claveGrupo = (p: PublicacionMl) => {
    if (verSeparadas) return p.id;
    if (p.inventory_id) return `inv:${p.inventory_id}`;
    if (p.relacion_item_id) return `rel:${[p.item_id, p.relacion_item_id].sort().join("|")}|${p.variation_id ?? 0}`;
    return p.id;
  };
  const gruposPorClave = new Map<string, PublicacionMl[]>();
  for (const p of publicaciones) {
    const clave = claveGrupo(p);
    gruposPorClave.set(clave, [...(gruposPorClave.get(clave) ?? []), p]);
  }
  const grupos: GrupoPublicacion[] = Array.from(gruposPorClave.values()).map((miembros) => {
    const ordenados = [...miembros].sort((a, b) => Number(a.catalogo) - Number(b.catalogo) || Number(b.estado === "active") - Number(a.estado === "active"));
    const principal = ordenados[0];
    const ligada = ordenados.map((m) => ({ m, liga: skuCrmDe(m, vinculos, skusCrm) })).find((x) => x.liga.sku);
    return {
      principal,
      otras: ordenados.slice(1),
      liga: ligada ? { ...ligada.liga, de: ligada.m } : { sku: null, origen: null, de: principal },
      // El producto sigue "activo" si cualquiera de sus publicaciones lo está.
      activo: ordenados.some((m) => m.estado === "active"),
      full: ordenados.some((m) => m.logistica === "Full"),
    };
  });
  const sinLigar = grupos.filter((g) => !g.liga.sku).length;

  const texto = q.trim().toLowerCase();
  const coincideTexto = (p: PublicacionMl) => [p.titulo, p.variacion, p.seller_sku, p.item_id].some((t) => t?.toLowerCase().includes(texto));
  const coincide = grupos
    .filter((g) => (filtro === "full" ? g.full : filtro === "sinligar" ? !g.liga.sku : true))
    .filter((g) => !texto || [g.principal, ...g.otras].some(coincideTexto))
    // Lo más valioso hasta arriba: valor a precio de venta (precio × piezas).
    .sort(
      (a, b) =>
        valorPublicacion(b.principal) - valorPublicacion(a.principal) ||
        (b.principal.full_disponible ?? -1) - (a.principal.full_disponible ?? -1) ||
        (a.principal.titulo ?? "").localeCompare(b.principal.titulo ?? ""),
    );
  // Pausadas y finalizadas van escondidas hasta abajo — salvo que Isaac esté
  // buscando algo: entonces se muestra todo lo que coincida, en una sola lista.
  const activas = texto ? coincide : coincide.filter((g) => g.activo);
  const inactivas = texto ? [] : coincide.filter((g) => !g.activo);

  const opcionesProducto = resumenes.map((r) => ({ sku: r.sku, nombre: r.nombre, stockActual: r.stockActual, imagenUrl: r.imagenUrl }));

  const FILTROS = [
    { valor: "todas", etiqueta: "Todas" },
    { valor: "full", etiqueta: "Solo Full" },
    { valor: "sinligar", etiqueta: `Sin ligar${sinLigar ? ` (${sinLigar})` : ""}` },
  ];

  const tabla = (lista: GrupoPublicacion[]) => (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-100 text-xs text-zinc-400">
            <th className="px-5 py-3 font-medium">Publicación</th>
            <th className="px-3 py-3 text-right font-medium" title="Precio × piezas (en Full si está en Full; si no, lo publicado)">
              Valor
            </th>
            <th className="px-3 py-3 text-right font-medium">Precio</th>
            <th className="px-3 py-3 text-right font-medium">En Full</th>
            <th className="px-3 py-3 text-right font-medium">Publicado</th>
            <th className="px-3 py-3 font-medium">Tipo</th>
            <th className="px-3 py-3 font-medium">Producto del CRM</th>
            <th className="px-5 py-3 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {lista.map((g) => {
            const p = g.principal;
            const { liga } = g;
            const noDisponibles = p.full_no_disponible ?? 0;
            const valor = valorPublicacion(p);
            const estadoMostrado = g.activo ? "active" : p.estado;
            return (
              <tr key={p.id} className="align-top">
                <td className="px-5 py-2.5">
                  <div className="flex items-center gap-3">
                    {p.imagen_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- miniatura de Mercado Libre
                      <img src={p.imagen_url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="h-10 w-10 shrink-0 rounded-lg bg-zinc-100" />
                    )}
                    <div className="min-w-0 max-w-xs">
                      <p className="truncate font-medium text-zinc-900" title={p.titulo ?? ""}>
                        {p.titulo}
                        {p.catalogo && <span className="ml-1.5 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20">catálogo</span>}
                      </p>
                      <p className="truncate text-xs text-zinc-400">
                        {[p.variacion, p.seller_sku ? `SKU ${p.seller_sku}` : null, p.item_id].filter(Boolean).join(" · ")}
                      </p>
                      {g.otras.length > 0 && (
                        <p className="text-[11px] text-violet-700" title="Comparten el mismo stock; se muestran como un solo producto">
                          + {g.otras.map((o) => `${o.catalogo ? "catálogo " : ""}${o.item_id}${o.estado !== "active" ? ` (${(ESTADOS_PUBLICACION[o.estado ?? ""] ?? o.estado ?? "?").toLowerCase()})` : ""}`).join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  {valor > 0 ? <span className="font-semibold text-zinc-900">{formatoPesos(valor)}</span> : <span className="text-zinc-300">—</span>}
                </td>
                <td className="px-3 py-2.5 text-right text-zinc-700">{p.precio !== null ? formatoPesos(p.precio) : "—"}</td>
                <td className="px-3 py-2.5 text-right">
                  {p.full_disponible !== null ? (
                    <>
                      <span className="font-semibold text-zinc-900">{p.full_disponible.toLocaleString("es-MX")}</span>
                      {noDisponibles > 0 && (
                        <p className="text-[11px] text-amber-700" title={(p.full_detalle ?? []).map((d) => `${d.status}: ${d.quantity}`).join(", ")}>
                          +{noDisponibles} no disp.
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right text-zinc-500">{p.cantidad_publicada ?? "—"}</td>
                <td className="px-3 py-2.5 text-xs text-zinc-600">{p.logistica ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <LigaProducto
                    itemId={liga.de.item_id}
                    variationId={liga.de.variation_id}
                    sku={liga.sku}
                    origen={liga.origen}
                    nombre={liga.sku ? (nombrePorSku.get(liga.sku) ?? null) : null}
                    opciones={opcionesProducto}
                  />
                </td>
                <td className="px-5 py-2.5">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                      estadoMostrado === "active" ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-zinc-100 text-zinc-600 ring-zinc-500/20"
                    }`}
                  >
                    {ESTADOS_PUBLICACION[estadoMostrado ?? ""] ?? estadoMostrado ?? "?"}
                  </span>
                </td>
              </tr>
            );
          })}
          {lista.length === 0 && (
            <tr>
              <td colSpan={8} className="px-5 py-8 text-center text-sm text-zinc-400">
                Nada que mostrar con ese filtro.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Stock en Mercado Libre</h2>
          <p className="text-sm text-zinc-500">Tus publicaciones y lo que Mercado Libre tiene en Full. Cada variante es un renglón.</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <BotonSincronizarStock conectado={Boolean(conexion)} />
          {sync?.ultima_sync_stock && <p className="text-[11px] text-zinc-400">actualizado {formatoFechaHoraMx(sync.ultima_sync_stock)} · se actualiza solo cada hora</p>}
        </div>
      </div>

      {!conexion && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Mercado Libre no está conectado. Ve a <Link href="/mercadolibre/conexion" className="underline">Conexión</Link>.
        </div>
      )}
      {errorLectura && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorLectura} — si dice que falta una tabla, corre el SQL 0032 en Supabase.
        </div>
      )}
      {sync?.ultimo_error_stock && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">La última actualización falló: {sync.ultimo_error_stock}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs text-zinc-500">En bodega (CRM)</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{piezasBodega.toLocaleString("es-MX")} pzas</p>
          <p className="text-xs text-zinc-400">{formatoPesos(valorBodega)} a costo</p>
        </div>
        <div className="rounded-2xl border border-[#2D3277]/20 bg-[#2D3277]/5 p-5 shadow-sm">
          <p className="text-xs text-[#2D3277]">En Full (Mercado Libre)</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{full.piezas.toLocaleString("es-MX")} pzas</p>
          <p className="text-xs text-zinc-500">
            {formatoPesos(full.valor)} a costo
            {full.inventariosSinLigar > 0 && <span className="text-amber-700"> · {full.inventariosSinLigar} sin ligar (sin valor)</span>}
            {full.noDisponibles > 0 && <> · {full.noDisponibles.toLocaleString("es-MX")} no disponibles</>}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-xs text-emerald-800">Total</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-900">{(piezasBodega + full.piezas).toLocaleString("es-MX")} pzas</p>
          <p className="text-xs text-emerald-800">{formatoPesos(valorBodega + full.valor)} a costo</p>
        </div>
      </div>

      <form className="flex flex-wrap items-center gap-2" action="/mercadolibre/stock">
        <div className="flex overflow-hidden rounded-lg border border-zinc-300 text-xs">
          {FILTROS.map((f) => (
            <Link
              key={f.valor}
              href={`/mercadolibre/stock?filtro=${f.valor}${q ? `&q=${encodeURIComponent(q)}` : ""}${verSeparadas ? "&separadas=1" : ""}`}
              className={`px-3 py-1.5 ${filtro === f.valor ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:text-zinc-900"}`}
            >
              {f.etiqueta}
            </Link>
          ))}
        </div>
        <input type="hidden" name="filtro" value={filtro} />
        {verSeparadas && <input type="hidden" name="separadas" value="1" />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre, SKU o ID…"
          className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:ring-zinc-500 sm:w-72"
        />
        <Link
          href={`/mercadolibre/stock?filtro=${filtro}${q ? `&q=${encodeURIComponent(q)}` : ""}${verSeparadas ? "" : "&separadas=1"}`}
          className="text-xs text-zinc-400 underline-offset-2 hover:text-zinc-700 hover:underline"
        >
          {verSeparadas ? "Juntar tradicional + catálogo en un renglón" : "Ver cada publicación por separado"}
        </Link>
      </form>

      {publicaciones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <p className="text-base font-medium text-zinc-900">Todavía no se han traído tus publicaciones</p>
          <p className="mt-1 text-sm text-zinc-500">Dale a “Actualizar desde Mercado Libre”.</p>
        </div>
      ) : (
        <>
          {tabla(activas)}
          {inactivas.length > 0 && (
            <details className="group rounded-2xl border border-zinc-200 bg-zinc-50/60">
              <summary className="cursor-pointer select-none px-5 py-3 text-sm text-zinc-500 hover:text-zinc-800">
                <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
                Pausadas y finalizadas ({inactivas.length.toLocaleString("es-MX")}) — escondidas para no estorbar; si buscas arriba, sí aparecen
              </summary>
              <div className="px-2 pb-2">{tabla(inactivas)}</div>
            </details>
          )}
        </>
      )}

      <p className="text-xs text-zinc-400">
        “En Full” es lo que Mercado Libre tiene en su bodega listo para vender; “Publicado” es la cantidad que muestra
        el anuncio (para Colecta/Flex es la que tú pusiste, no un inventario real). Publicaciones que comparten
        inventario (tradicional + catálogo) se muestran como un solo producto y se cuentan una sola vez en los totales. Las tarjetas de arriba usan el costo
        promedio del producto del CRM ligado; la columna “Valor” y el orden de la lista usan el precio de venta × piezas
        (lo que tienes en Full, o lo publicado si no está en Full) — lo más valioso queda hasta arriba.
      </p>
    </div>
  );
}

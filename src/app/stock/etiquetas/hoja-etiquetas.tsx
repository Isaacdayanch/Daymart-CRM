"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BotonGuardar } from "@/components/boton-guardar";
import { CodigoBarras } from "@/components/codigo-barras";
import { Selector } from "@/components/selector";
import { FORMATOS_ETIQUETA, formatoPorId, textoOrigenCodigo, type FormatoEtiqueta, type ProductoEtiqueta } from "@/lib/etiquetas";
import { guardarCodigoMl } from "./actions";

const MAX_ETIQUETAS = 2000;

function normalizar(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Pantalla de etiquetas (Isaac, 19 oct): elige productos y cuántas etiquetas
 * de cada uno, el formato (rollo térmico u hoja carta con etiquetas
 * adhesivas) y le da "Imprimir / Guardar como PDF". La vista previa de abajo
 * es exactamente lo que sale impreso. Etiqueta = SKU grande, nombre, código
 * de barras del Código ML de Full y el código escrito; sin código, solo SKU
 * y nombre. Sin imagen (así lo pidió).
 */
export function HojaEtiquetas({ productos, seleccionInicial, titulo }: { productos: ProductoEtiqueta[]; seleccionInicial: Record<string, number>; titulo: string | null }) {
  const [copias, setCopias] = useState<Record<string, number>>(seleccionInicial);
  const [formatoId, setFormatoId] = useState(FORMATOS_ETIQUETA[0].id);
  const [busqueda, setBusqueda] = useState("");
  const [soloSeleccionados, setSoloSeleccionados] = useState(Object.keys(seleccionInicial).length > 0);
  const formato = formatoPorId(formatoId);

  const porSku = useMemo(() => new Map(productos.map((p) => [p.sku, p])), [productos]);
  const seleccionados = useMemo(
    () =>
      Object.entries(copias)
        .filter(([sku, n]) => n > 0 && porSku.has(sku))
        .map(([sku, n]) => ({ producto: porSku.get(sku)!, copias: n })),
    [copias, porSku],
  );
  const totalEtiquetas = seleccionados.reduce((s, x) => s + x.copias, 0);
  const sinCodigo = seleccionados.filter((x) => !x.producto.codigoMl).length;

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return productos.filter((p) => {
      if (soloSeleccionados && !(copias[p.sku] > 0)) return false;
      if (!q) return true;
      return normalizar(`${p.sku} ${p.nombre} ${p.codigoMl ?? ""}`).includes(q);
    });
  }, [productos, busqueda, soloSeleccionados, copias]);

  function fijar(sku: string, n: number) {
    setCopias((c) => ({ ...c, [sku]: Math.max(0, Math.min(MAX_ETIQUETAS, Math.round(n) || 0)) }));
  }

  // Lista plana de etiquetas a imprimir, en el orden de la selección.
  const etiquetas = useMemo(() => {
    const lista: ProductoEtiqueta[] = [];
    for (const { producto, copias: n } of seleccionados) {
      for (let i = 0; i < n && lista.length < MAX_ETIQUETAS; i++) lista.push(producto);
    }
    return lista;
  }, [seleccionados]);

  return (
    <div className="space-y-6">
      <div className="space-y-4 print:hidden">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <label className="block text-xs font-medium text-zinc-500">Formato de etiqueta</label>
              <div className="mt-1">
                <Selector defaultValue={formatoId} onChange={setFormatoId} opciones={FORMATOS_ETIQUETA.map((f) => ({ value: f.id, label: `${f.nombre} — ${f.descripcion}` }))} />
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-zinc-600">
                <strong className="text-zinc-900">{totalEtiquetas.toLocaleString("es-MX")}</strong> etiqueta{totalEtiquetas === 1 ? "" : "s"} de{" "}
                <strong className="text-zinc-900">{seleccionados.length}</strong> producto{seleccionados.length === 1 ? "" : "s"}
                {formato.hoja && totalEtiquetas > 0 && <> · {Math.ceil(totalEtiquetas / (formato.columnas * formato.filas))} hoja(s)</>}
              </p>
              {sinCodigo > 0 && <p className="text-xs text-amber-700">{sinCodigo} sin código ML: salen solo con SKU y nombre.</p>}
              {totalEtiquetas >= MAX_ETIQUETAS && <p className="text-xs text-amber-700">Tope de {MAX_ETIQUETAS.toLocaleString("es-MX")} etiquetas por impresión; imprime en partes.</p>}
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={totalEtiquetas === 0}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 active:scale-[0.97] disabled:opacity-40"
            >
              Imprimir / Guardar como PDF
            </button>
          </div>
          <p className="mt-2 text-[11px] text-zinc-400">
            En el cuadro de impresión pon <strong>escala 100%</strong> y <strong>sin márgenes</strong> (el tamaño ya va en la página). En rollo, elige el tamaño de etiqueta de tu impresora térmica.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-zinc-700">{titulo ?? "Productos"}</p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                <input type="checkbox" checked={soloSeleccionados} onChange={(e) => setSoloSeleccionados(e.target.checked)} className="h-3.5 w-3.5 rounded border-zinc-300" />
                solo los seleccionados
              </label>
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, SKU o código ML"
                className="w-64 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:ring-zinc-500"
              />
            </div>
          </div>
          <ul className="mt-3 divide-y divide-zinc-100">
            {visibles.length === 0 && <li className="py-6 text-center text-sm text-zinc-400">Nada que mostrar.</li>}
            {visibles.map((p) => (
              <FilaProducto key={p.sku} producto={p} copias={copias[p.sku] ?? 0} onCopias={(n) => fijar(p.sku, n)} />
            ))}
          </ul>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-zinc-500 print:hidden">Vista previa (así salen impresas)</p>
        {totalEtiquetas === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-400 print:hidden">Elige al menos un producto y cuántas etiquetas quieres.</div>
        ) : (
          <AreaImpresion etiquetas={etiquetas} formato={formato} />
        )}
      </div>
    </div>
  );
}

function FilaProducto({ producto: p, copias, onCopias }: { producto: ProductoEtiqueta; copias: number; onCopias: (n: number) => void }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [codigo, setCodigo] = useState(p.codigoMl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  return (
    <li className="flex flex-wrap items-center gap-3 py-2">
      <input type="checkbox" checked={copias > 0} onChange={(e) => onCopias(e.target.checked ? Math.max(1, p.copiasPropuestas) : 0)} className="h-4 w-4 rounded border-zinc-300" aria-label={`Incluir ${p.sku}`} />
      {p.imagenUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- miniatura chica de la lista (no se imprime)
        <img src={p.imagenUrl} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
      ) : (
        <div className="h-9 w-9 shrink-0 rounded-md bg-zinc-100" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-900">{p.nombre}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
          <span className="font-mono">{p.sku}</span>
          {p.detalle && <span className="text-sky-700">{p.detalle}</span>}
          {editando ? (
            <form
              action={async () => {
                setGuardando(true);
                setError(null);
                const r = await guardarCodigoMl(p.sku, codigo);
                setGuardando(false);
                if (r.error) setError(r.error);
                else {
                  setEditando(false);
                  router.refresh();
                }
              }}
              className="inline-flex items-center gap-1.5"
            >
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                placeholder="IBHA96856"
                autoFocus
                className="w-32 rounded-md border border-zinc-300 px-2 py-0.5 font-mono text-xs focus:border-zinc-500 focus:ring-zinc-500"
              />
              <BotonGuardar cargando={guardando} className="rounded-md bg-zinc-900 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-zinc-700">
                Guardar
              </BotonGuardar>
              <button type="button" onClick={() => setEditando(false)} className="text-[11px] text-zinc-400 hover:text-zinc-900">
                cancelar
              </button>
            </form>
          ) : p.codigoMl ? (
            <span>
              código ML <span className="font-mono text-zinc-800">{p.codigoMl}</span> <span className="text-zinc-400">({textoOrigenCodigo(p.origenCodigo)})</span>{" "}
              <button type="button" onClick={() => setEditando(true)} className="text-zinc-400 underline-offset-2 hover:text-zinc-900 hover:underline">
                cambiar
              </button>
            </span>
          ) : (
            <span className="text-amber-700">
              sin código ML (sale sin código de barras){" "}
              <button type="button" onClick={() => setEditando(true)} className="text-amber-800 underline-offset-2 hover:underline">
                ponerlo
              </button>
            </span>
          )}
          {p.otrosCodigosMl.length > 0 && <span className="text-zinc-400">· ML también tiene: {p.otrosCodigosMl.join(", ")}</span>}
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      <label className="flex items-center gap-1.5 text-xs text-zinc-500">
        etiquetas
        <input
          type="number"
          min={0}
          max={MAX_ETIQUETAS}
          value={copias}
          onChange={(e) => onCopias(Number(e.target.value))}
          className="w-20 rounded-lg border border-zinc-300 px-2 py-1 text-right text-sm focus:border-zinc-500 focus:ring-zinc-500"
        />
      </label>
    </li>
  );
}

/** Páginas de impresión: en rollo cada etiqueta es una página; en hoja
 * carta, rejilla con los márgenes del papel de etiquetas. El `@page` fija
 * el tamaño del papel para que salga a escala real. */
export function AreaImpresion({ etiquetas, formato }: { etiquetas: ProductoEtiqueta[]; formato: FormatoEtiqueta }) {
  const porPagina = formato.columnas * formato.filas;
  const paginas: ProductoEtiqueta[][] = [];
  for (let i = 0; i < etiquetas.length; i += porPagina) paginas.push(etiquetas.slice(i, i + porPagina));
  const tamano = formato.hoja ? `${formato.hoja.ancho}mm ${formato.hoja.alto}mm` : `${formato.ancho}mm ${formato.alto}mm`;

  return (
    <div className="overflow-x-auto">
      {/* Tamaño real del papel y, al imprimir, sin márgenes, sin sombras ni
          líneas punteadas (en una hoja de etiquetas adhesivas estorbarían) y
          una página por hoja/etiqueta. */}
      <style>{`@page { size: ${tamano}; margin: 0; } @media print { html, body { margin: 0 !important; padding: 0 !important; background: white !important; } .area-etiquetas { display: block !important; gap: 0 !important; overflow: visible !important; } .pagina-etiquetas { margin: 0 !important; box-shadow: none !important; height: auto !important; break-after: page; page-break-after: always; } .pagina-etiquetas:last-child { break-after: auto; page-break-after: auto; } .etiqueta-item { outline: none !important; } }`}</style>
      <div className="area-etiquetas flex flex-col gap-3">
        {paginas.map((pagina, i) =>
          formato.hoja ? (
            <div
              key={i}
              className="pagina-etiquetas shrink-0 bg-white shadow-sm ring-1 ring-zinc-200 print:shadow-none print:ring-0"
              style={{
                width: `${formato.hoja.ancho}mm`,
                // Altura de hoja solo en pantalla (vista previa); al imprimir
                // va en auto (ver el <style>): con altura fija Chrome colaba
                // una página en blanco al final.
                height: `${formato.hoja.alto}mm`,
                paddingTop: `${formato.hoja.margenSup}mm`,
                paddingLeft: `${formato.hoja.margenIzq}mm`,
                boxSizing: "border-box",
                display: "grid",
                gridTemplateColumns: `repeat(${formato.columnas}, ${formato.ancho}mm)`,
                gridAutoRows: `${formato.alto}mm`,
                columnGap: `${formato.hoja.sepX}mm`,
                rowGap: `${formato.hoja.sepY}mm`,
                alignContent: "start",
              }}
            >
              {pagina.map((p, j) => (
                <Etiqueta key={j} producto={p} formato={formato} />
              ))}
            </div>
          ) : (
            <div key={i} className="pagina-etiquetas shrink-0 bg-white shadow-sm ring-1 ring-zinc-200 print:shadow-none print:ring-0" style={{ width: `${formato.ancho}mm`, height: `${formato.alto}mm` }}>
              <Etiqueta producto={pagina[0]} formato={formato} />
            </div>
          ),
        )}
      </div>
    </div>
  );
}

/** Una etiqueta: detalle de mancuerna si aplica (arriba, chiquito), SKU
 * grande, nombre (1–2 líneas), código de barras del Código ML y el código
 * escrito debajo. Sin marca ni imagen (Isaac, 20 oct: "quita el Daymart
 * en pequeño de arriba"). */
function Etiqueta({ producto: p, formato }: { producto: ProductoEtiqueta; formato: FormatoEtiqueta }) {
  const grande = formato.alto >= 40;
  const altoBarra = grande ? 16 : Math.max(6, formato.alto * 0.34);
  // En etiqueta chica con código, el nombre va en UNA línea (si no, la
  // segunda línea se encima al código de barras); sin código caben dos.
  const lineasNombre = grande || !p.codigoMl ? 2 : 1;
  return (
    <div
      className="etiqueta-item flex flex-col overflow-hidden text-black"
      style={{ width: `${formato.ancho}mm`, height: `${formato.alto}mm`, padding: grande ? "2.5mm 3mm" : "1.3mm 2mm", boxSizing: "border-box", outline: "1px dashed #e4e4e7", outlineOffset: "-1px" }}
    >
      {/* Isaac (20 oct): sin la marca chiquita arriba; solo el detalle de mancuerna si lo hay. */}
      {p.detalle && (
        <div className="truncate text-zinc-700" style={{ fontSize: grande ? "7pt" : "5.5pt", lineHeight: 1.1 }}>
          {p.detalle}
        </div>
      )}
      <div className="truncate font-mono font-bold" style={{ fontSize: grande ? "15pt" : "9.5pt", lineHeight: 1.15, marginTop: p.detalle ? (grande ? "1mm" : "0.4mm") : 0 }}>
        {p.sku}
      </div>
      <div className={lineasNombre === 1 ? "truncate" : "line-clamp-2"} style={{ fontSize: grande ? "9pt" : "6.5pt", lineHeight: 1.2, marginTop: grande ? "0.6mm" : "0.3mm" }}>
        {p.nombre}
      </div>
      {p.codigoMl && (
        <div className="mt-auto shrink-0">
          <CodigoBarras texto={p.codigoMl} altoMm={altoBarra} />
          <div className="text-center font-mono" style={{ fontSize: grande ? "8pt" : "6pt", letterSpacing: "0.12em", lineHeight: 1.1, marginTop: "0.3mm" }}>
            {p.codigoMl}
          </div>
        </div>
      )}
    </div>
  );
}

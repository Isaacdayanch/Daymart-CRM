"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ResumenSku } from "@/lib/calculos-stock";
import { formatoCajas, formatoPesos } from "@/lib/formato";
import { Selector } from "@/components/selector";

function normaliza(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const TODAS_CATEGORIAS = "";

export function TablaStock({
  resumenes,
  bodegasPorId,
  verDinero = true,
  categorias = [],
}: {
  resumenes: ResumenSku[];
  bodegasPorId: Record<string, string>;
  verDinero?: boolean;
  categorias?: string[];
}) {
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState(TODAS_CATEGORIAS);

  const filtrados = useMemo(() => {
    const texto = normaliza(busqueda.trim());
    return resumenes.filter((r) => {
      const coincideTexto = !texto || normaliza(r.nombre).includes(texto) || normaliza(r.sku).includes(texto);
      const coincideCategoria = !categoria || r.categoria === categoria;
      return coincideTexto && coincideCategoria;
    });
  }, [resumenes, busqueda, categoria]);

  const hrefImprimir = categoria ? `/stock/imprimir?categoria=${encodeURIComponent(categoria)}` : "/stock/imprimir";

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-zinc-100 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative">
            <svg
              width="15"
              height="15"
              viewBox="0 0 20 20"
              fill="none"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400"
            >
              <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M14 14L18 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por producto o SKU…"
              className="w-full rounded-full border border-zinc-300 bg-zinc-50 py-2 pr-4 pl-9 text-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:bg-white focus:ring-zinc-500 sm:w-56"
            />
          </div>
          {categorias.length > 0 && (
            <div className="sm:w-48">
              <Selector
                onChange={setCategoria}
                defaultValue={TODAS_CATEGORIAS}
                opciones={[
                  { value: TODAS_CATEGORIAS, label: "Todas las categorías" },
                  ...categorias.map((c) => ({ value: c, label: c })),
                ]}
              />
            </div>
          )}
        </div>
        <Link href={hrefImprimir} className="shrink-0 text-xs font-medium text-zinc-500 transition hover:text-zinc-900">
          Imprimir {categoria ? `“${categoria}”` : "hoja de conteo"} →
        </Link>
      </div>

      {filtrados.length === 0 ? (
        <p className="p-6 text-sm text-zinc-500">
          No se encontró ningún producto{busqueda && ` con “${busqueda}”`}
          {categoria && ` en la categoría “${categoria}”`}.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-xs text-zinc-400">
                <th className="px-6 py-2.5 font-medium">Producto</th>
                <th className="px-6 py-2.5 font-medium text-right">Piezas</th>
                <th className="px-6 py-2.5 font-medium text-right">Cajas</th>
                {verDinero && <th className="px-6 py-2.5 font-medium text-right">Costo prom.</th>}
                {verDinero && <th className="px-6 py-2.5 font-medium text-right">Valor</th>}
                <th className="px-6 py-2.5 font-medium text-right">Rotación/día</th>
                <th className="px-6 py-2.5 font-medium">Bodegas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtrados.map((r) => (
                <tr key={r.sku} className={r.necesitaReorden && r.stockActual > 0 ? "bg-amber-50/40" : ""}>
                  <td className="px-6 py-3">
                    <Link
                      href={`/stock/producto/${encodeURIComponent(r.sku)}`}
                      className="flex items-center gap-3 hover:underline"
                    >
                      {r.imagenUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- miniatura en tabla, tamaño fijo
                        <img
                          src={r.imagenUrl}
                          alt={r.nombre}
                          className="h-10 w-10 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-[9px] text-zinc-400">
                          Sin foto
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-zinc-900">{r.nombre}</p>
                        <p className="font-mono text-xs text-zinc-400 no-underline">{r.sku}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-right font-semibold text-zinc-900">{r.stockActual}</td>
                  <td className="px-6 py-3 text-right text-xs text-zinc-400">
                    {r.cajas > 0 ? formatoCajas(r.cajas) : "—"}
                  </td>
                  {verDinero && (
                    <td className="px-6 py-3 text-right text-zinc-600">{formatoPesos(r.costoPromedio)}</td>
                  )}
                  {verDinero && (
                    <td className="px-6 py-3 text-right text-zinc-600">{formatoPesos(r.valorInventario)}</td>
                  )}
                  <td className="px-6 py-3 text-right text-zinc-600">{r.rotacionDiaria.toFixed(2)}</td>
                  <td className="px-6 py-3 text-xs text-zinc-500">
                    {Array.from(r.stockPorBodega.entries())
                      .filter(([, cantidad]) => cantidad !== 0)
                      .map(([bodegaId, cantidad]) => `${bodegasPorId[bodegaId] ?? "?"}: ${cantidad}`)
                      .join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import { Selector } from "@/components/selector";

/** "Catálogo en PDF": Isaac elige filtros y abre la hoja imprimible en una
 * pestaña nueva (Imprimir → Guardar como PDF). */
export function FormularioPdfCatalogo({ categorias, marcas }: { categorias: string[]; marcas: string[] }) {
  const [categoria, setCategoria] = useState("");
  const [marca, setMarca] = useState("");
  const [incluirAgotados, setIncluirAgotados] = useState(false);
  const [sinCantidades, setSinCantidades] = useState(false);

  const p = new URLSearchParams();
  if (categoria) p.set("categoria", categoria);
  if (marca) p.set("marca", marca);
  if (incluirAgotados) p.set("todos", "1");
  if (sinCantidades) p.set("sin", "1");
  const href = `/stock/catalogo/imprimir${p.toString() ? `?${p}` : ""}`;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-zinc-900">Catálogo en PDF</h3>
      <p className="mt-0.5 text-xs text-zinc-500">Todos los productos a detalle (foto, descripción, empaque, disponibles). Se abre la hoja y le das &ldquo;Imprimir → Guardar como PDF&rdquo;.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Categoría</label>
          <div className="mt-1">
            <Selector defaultValue="" onChange={setCategoria} opciones={[{ value: "", label: "Todas" }, ...categorias.map((c) => ({ value: c, label: c }))]} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Marca</label>
          <div className="mt-1">
            <Selector defaultValue="" onChange={setMarca} opciones={[{ value: "", label: "Todas" }, ...marcas.map((m) => ({ value: m, label: m }))]} />
          </div>
        </div>
        <div className="flex flex-col justify-end gap-1.5 text-xs text-zinc-700">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={incluirAgotados} onChange={(e) => setIncluirAgotados(e.target.checked)} className="rounded border-zinc-300" />
            Incluir agotados
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={sinCantidades} onChange={(e) => setSinCantidades(e.target.checked)} className="rounded border-zinc-300" />
            Sin cantidades
          </label>
        </div>
        <div className="flex items-end">
          <a href={href} target="_blank" rel="noreferrer" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
            Abrir catálogo para PDF →
          </a>
        </div>
      </div>
    </div>
  );
}

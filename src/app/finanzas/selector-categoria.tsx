"use client";

import { useEffect, useRef, useState } from "react";
import type { CategoriaFinanciera } from "@/lib/tipos";

/** Selector de categoría con buscador: Isaac tiene muchísimas categorías y
 * el desplegable era eterno. Aquí escribe y se filtran (ordenadas por
 * abecedario); si la categoría no existe, la crea ahí mismo ("+ Crear
 * «Renta bodega»") — viaja como `categoria_nueva` y el servidor la da de
 * alta al guardar. Manda `categoria_id` (vacío = sin categoría). */
export function SelectorCategoria({
  categorias,
  defaultId = "",
  name = "categoria_id",
  permitirCrear = true,
  onChange,
  placeholder = "Escribe para buscar…",
}: {
  categorias: CategoriaFinanciera[];
  defaultId?: string;
  name?: string;
  permitirCrear?: boolean;
  /** Para usarlo como filtro (sin formulario): avisa el id elegido ("" = todas). */
  onChange?: (id: string) => void;
  placeholder?: string;
}) {
  const ordenadas = [...categorias].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const inicial = ordenadas.find((c) => c.id === defaultId);
  const [id, setId] = useState(inicial?.id ?? "");
  const [nueva, setNueva] = useState("");
  const [texto, setTexto] = useState(inicial?.nombre ?? "");
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function alClicFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAbierto(false);
        // Si dejó texto suelto sin elegir, se respeta lo último elegido.
        setTexto(nueva || ordenadas.find((c) => c.id === id)?.nombre || "");
      }
    }
    document.addEventListener("mousedown", alClicFuera);
    return () => document.removeEventListener("mousedown", alClicFuera);
  });

  const filtro = texto.trim().toLowerCase();
  const coincidencias = filtro ? ordenadas.filter((c) => c.nombre.toLowerCase().includes(filtro)) : ordenadas;
  const existeExacta = ordenadas.some((c) => c.nombre.toLowerCase() === filtro);

  function elegir(nuevoId: string, nombre: string) {
    setId(nuevoId);
    setNueva("");
    setTexto(nombre);
    setAbierto(false);
    onChange?.(nuevoId);
  }

  function crear() {
    const nombre = texto.trim();
    if (!nombre) return;
    setId("");
    setNueva(nombre);
    setTexto(nombre);
    setAbierto(false);
  }

  return (
    <div ref={ref} className="relative">
      <input type="hidden" name={name} value={id} />
      {permitirCrear && <input type="hidden" name="categoria_nueva" value={nueva} />}
      <input
        type="text"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        placeholder={placeholder}
        autoComplete="off"
        className="block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
      />
      {nueva && <p className="mt-1 text-[11px] text-emerald-700">Se creará la categoría «{nueva}» al guardar.</p>}
      {abierto && (
        <div className="absolute z-20 mt-1.5 max-h-64 w-full overflow-y-auto rounded-2xl border border-black/5 bg-white/95 py-1 shadow-xl ring-1 ring-black/5 backdrop-blur-sm">
          <button type="button" onClick={() => elegir("", "")} className={`block w-full px-3.5 py-2 text-left text-sm transition hover:bg-zinc-100 ${!id && !nueva ? "text-zinc-900" : "text-zinc-400"}`}>
            {onChange ? "Todas las categorías" : "Sin categoría"}
          </button>
          {coincidencias.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => elegir(c.id, c.nombre)}
              className={`block w-full truncate px-3.5 py-2 text-left text-sm transition hover:bg-zinc-100 ${c.id === id ? "bg-zinc-50 font-medium text-zinc-900" : "text-zinc-700"}`}
            >
              {c.nombre}
            </button>
          ))}
          {permitirCrear && filtro && !existeExacta && (
            <button type="button" onClick={crear} className="block w-full border-t border-zinc-100 px-3.5 py-2 text-left text-sm font-medium text-emerald-700 transition hover:bg-emerald-50">
              + Crear categoría «{texto.trim()}»
            </button>
          )}
          {coincidencias.length === 0 && !filtro && <p className="px-3.5 py-2 text-sm text-zinc-400">No hay categorías.</p>}
        </div>
      )}
    </div>
  );
}

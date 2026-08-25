"use client";

import { useEffect, useRef, useState } from "react";

interface Opcion {
  sku: string;
  nombre: string;
  stockActual: number;
  imagenUrl: string | null;
}

export function SelectorProducto({
  opciones,
  value,
  onChange,
}: {
  opciones: Opcion[];
  value: string;
  onChange: (sku: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const buscadorRef = useRef<HTMLInputElement>(null);

  const seleccionado = opciones.find((o) => o.sku === value);
  const filtradas = opciones.filter(
    (o) =>
      o.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      o.sku.toLowerCase().includes(busqueda.toLowerCase()),
  );

  useEffect(() => {
    function alClicFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    function alEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", alClicFuera);
    document.addEventListener("keydown", alEscape);
    return () => {
      document.removeEventListener("mousedown", alClicFuera);
      document.removeEventListener("keydown", alEscape);
    };
  }, []);

  useEffect(() => {
    if (abierto) buscadorRef.current?.focus();
  }, [abierto]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setBusqueda("");
          setAbierto((v) => !v);
        }}
        className="mt-1 flex w-full items-center gap-2.5 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-left text-sm focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 focus:outline-none"
      >
        {seleccionado?.imagenUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- miniatura chica en un botón
          <img src={seleccionado.imagenUrl} alt={seleccionado.nombre} className="h-8 w-8 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-[8px] text-zinc-400">
            {seleccionado ? "Sin foto" : ""}
          </div>
        )}
        <span className={`flex-1 truncate ${seleccionado ? "text-zinc-900" : "text-zinc-400"}`}>
          {seleccionado ? seleccionado.nombre : "Selecciona un producto"}
        </span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-zinc-400">
          <path d="M3.5 5.5 7 9l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {abierto && (
        <div className="absolute z-20 mt-1.5 w-full min-w-72 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl">
          <div className="border-b border-zinc-100 p-2">
            <input
              ref={buscadorRef}
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o SKU..."
              className="block w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm focus:border-zinc-500 focus:ring-1 focus:ring-zinc-300 focus:outline-none"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {filtradas.length === 0 ? (
              <p className="px-4 py-3 text-sm text-zinc-400">Sin resultados.</p>
            ) : (
              filtradas.map((o) => (
                <button
                  key={o.sku}
                  type="button"
                  onClick={() => {
                    onChange(o.sku);
                    setAbierto(false);
                  }}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-zinc-100 ${
                    o.sku === value ? "bg-zinc-50" : ""
                  }`}
                >
                  {o.imagenUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura en lista desplegable
                    <img src={o.imagenUrl} alt={o.nombre} className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-[9px] text-zinc-400">
                      Sin foto
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900">{o.nombre}</p>
                    <p className="font-mono text-xs text-zinc-400">{o.sku}</p>
                  </div>
                  <span className="shrink-0 text-xs text-zinc-400">{o.stockActual} en stock</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

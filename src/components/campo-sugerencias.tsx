"use client";

import { useEffect, useRef, useState } from "react";

/** Campo de texto libre (se puede escribir cualquier cosa) con un panel de
 * sugerencias propio — reemplaza el <input list="..."> nativo (datalist),
 * que se ve como un menú feo del sistema operativo y no se puede
 * personalizar. Al escribir se filtran las sugerencias; con el mouse
 * también se puede abrir la lista completa. */
export function CampoSugerencias({
  name,
  value,
  onChange,
  sugerencias,
  placeholder,
  required,
  className,
}: {
  name?: string;
  value: string;
  onChange: (valor: string) => void;
  sugerencias: string[];
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtradas = sugerencias.filter(
    (s) => s.toLowerCase() !== value.toLowerCase() && s.toLowerCase().includes(value.toLowerCase()),
  );

  useEffect(() => {
    function alClicFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", alClicFuera);
    return () => document.removeEventListener("mousedown", alClicFuera);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        name={name}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        autoComplete="off"
        className={
          className ??
          "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
        }
      />
      {abierto && filtradas.length > 0 && (
        <div className="absolute z-20 mt-1.5 w-full max-h-56 overflow-y-auto rounded-2xl border border-black/5 bg-white/95 py-1 shadow-xl ring-1 ring-black/5 backdrop-blur-sm">
          {filtradas.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                onChange(s);
                setAbierto(false);
              }}
              className="block w-full truncate px-3.5 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-100"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

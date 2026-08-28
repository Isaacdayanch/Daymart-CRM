"use client";

import { useEffect, useRef, useState } from "react";

export interface OpcionSelector {
  value: string;
  label: React.ReactNode;
}

const claseTriggerDefecto =
  "flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-left text-sm transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 focus:outline-none";

/** Desplegable propio (panel flotante redondeado, con sombra) para
 * reemplazar el <select> nativo del sistema. Funciona "sin controlar": el
 * valor vive dentro del componente y se manda al formulario con un input
 * oculto, igual que un <select> normal — no hace falta useState en quien lo usa. */
export function Selector({
  name,
  defaultValue,
  opciones,
  placeholder = "Selecciona",
  onChange,
  claseTrigger,
  panelAncho = "w-full",
}: {
  name?: string;
  defaultValue?: string;
  opciones: OpcionSelector[];
  placeholder?: string;
  onChange?: (valor: string) => void;
  claseTrigger?: string;
  panelAncho?: string;
}) {
  const [valor, setValor] = useState(defaultValue ?? "");
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const actual = opciones.find((o) => o.value === valor);

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

  return (
    <div ref={ref} className="relative">
      {name && <input type="hidden" name={name} value={valor} />}
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className={claseTrigger ?? claseTriggerDefecto}
      >
        <span className={actual ? "" : "text-zinc-400"}>{actual?.label ?? placeholder}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 14 14"
          fill="none"
          className={`shrink-0 text-zinc-400 transition-transform ${abierto ? "rotate-180" : ""}`}
        >
          <path d="M3.5 5.5 7 9l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {abierto && (
        <div
          className={`absolute z-20 mt-1.5 ${panelAncho} min-w-max overflow-hidden rounded-2xl border border-black/5 bg-white/95 py-1 shadow-xl ring-1 ring-black/5 backdrop-blur-sm`}
        >
          {opciones.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                setValor(o.value);
                onChange?.(o.value);
                setAbierto(false);
              }}
              className={`flex w-full items-center justify-between gap-4 px-3.5 py-2 text-left text-sm transition hover:bg-zinc-100 ${
                o.value === valor ? "font-medium text-zinc-900" : "text-zinc-600"
              }`}
            >
              {o.label}
              {o.value === valor && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-zinc-900">
                  <path
                    d="M2.5 7.5 5.5 10.5 11.5 4"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const ITEMS = [
  {
    href: "/contenedores/nuevo",
    etiqueta: "Nuevo contenedor",
    icono: (
      <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    ),
  },
  {
    href: "/stock",
    etiqueta: "Stock",
    icono: (
      <path
        d="M3 6.5 9 3l6 3.5v6L9 16l-6-3.5v-6ZM3 6.5 9 10l6-3.5M9 10v6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/papelera",
    etiqueta: "Papelera",
    icono: (
      <path
        d="M4 5.5h10M7.5 5.5V4a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M6 5.5v8a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
];

export function MenuMas() {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Más opciones"
        aria-expanded={abierto}
        className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
          abierto ? "bg-zinc-100 text-zinc-900" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
        }`}
      >
        <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
          <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {abierto && (
        <div className="absolute right-0 z-20 mt-2 w-52 origin-top-right overflow-hidden rounded-2xl border border-black/5 bg-white/95 py-1.5 shadow-xl ring-1 ring-black/5 backdrop-blur-sm">
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setAbierto(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-zinc-400">
                {item.icono}
              </svg>
              {item.etiqueta}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

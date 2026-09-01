"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

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
    href: "/stock/salidas",
    etiqueta: "Dar salida",
    icono: (
      <path
        d="M3 9h9M8.5 5.5 12 9l-3.5 3.5M12 4v-.5A1.5 1.5 0 0 0 10.5 2h-6A1.5 1.5 0 0 0 3 3.5v11A1.5 1.5 0 0 0 4.5 16h6a1.5 1.5 0 0 0 1.5-1.5V14"
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

/** <details>/<summary> nativo en vez de estado de React + listeners a mano:
 * abrir/cerrar lo maneja el navegador mismo, así que funciona igual en
 * Chrome, Safari, Firefox, computadora o celular sin sorpresas. */
export function MenuMas() {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function alClicFuera(e: MouseEvent) {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) {
        ref.current.open = false;
      }
    }
    function alEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && ref.current) ref.current.open = false;
    }
    document.addEventListener("click", alClicFuera);
    document.addEventListener("keydown", alEscape);
    return () => {
      document.removeEventListener("click", alClicFuera);
      document.removeEventListener("keydown", alEscape);
    };
  }, []);

  function cerrar() {
    if (ref.current) ref.current.open = false;
  }

  return (
    <details ref={ref} className="relative">
      <summary
        aria-label="Más opciones"
        className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 [&::-webkit-details-marker]:hidden [&::marker]:content-none"
      >
        <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
          <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-52 origin-top-right overflow-hidden rounded-2xl border border-black/5 bg-white/95 py-1.5 shadow-xl ring-1 ring-black/5 backdrop-blur-sm">
        {ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={cerrar}
            className="flex items-center gap-2.5 px-4 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-zinc-400">
              {item.icono}
            </svg>
            {item.etiqueta}
          </Link>
        ))}
      </div>
    </details>
  );
}

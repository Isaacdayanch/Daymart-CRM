"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { Rol } from "@/lib/tipos";
import { cerrarSesion } from "./login/actions";

const ITEMS = [
  {
    href: "/research",
    etiqueta: "Research",
    soloDueno: true,
    icono: (
      <path
        d="M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM15.5 15.5 12.5 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/finanzas",
    etiqueta: "Finanzas",
    soloDueno: true,
    icono: (
      <path
        d="M3 6a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 15 6v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 12V6ZM3 7.5h12M11 10.5h2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/contenedores",
    etiqueta: "Contenedores",
    icono: (
      <path
        d="M2.5 6.5 9 3l6.5 3.5v7L9 17l-6.5-3.5v-7ZM2.5 6.5 9 10l6.5-3.5M9 10v7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
    href: "/usuarios",
    etiqueta: "Usuarios",
    soloDueno: true,
    icono: (
      <path
        d="M6.5 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2.5 15c0-2.5 1.8-4 4-4s4 1.5 4 4M11.5 8a2 2 0 1 0 0-4M13 15c0-2-1.2-3.3-2.7-3.8"
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
export function MenuMas({ rol }: { rol?: Rol }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const items = rol === "operadora" ? ITEMS.filter((item) => !item.soloDueno) : ITEMS;

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
        {items.map((item) => (
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
        <form action={cerrarSesion} className="border-t border-zinc-100">
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-100"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-zinc-400">
              <path
                d="M7 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3H7M12 12.5 15.5 9 12 5.5M15.5 9h-9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Cerrar sesión
          </button>
        </form>
      </div>
    </details>
  );
}

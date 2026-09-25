"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PESTANAS = [
  { href: "/mercadolibre", etiqueta: "Ventas" },
  { href: "/mercadolibre/stock", etiqueta: "Publicaciones" },
  { href: "/mercadolibre/precios", etiqueta: "Precios" },
  { href: "/mercadolibre/conexion", etiqueta: "Conexión" },
];

export function NavMercadoLibre() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto">
      {PESTANAS.map((p) => {
        const activa = p.href === "/mercadolibre" ? pathname === "/mercadolibre" || pathname === "/mercadolibre/ventas" : pathname.startsWith(p.href);
        return (
          <Link
            key={p.href}
            href={p.href}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              activa ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            {p.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PESTANAS = [
  { href: "/ventas", etiqueta: "Ventas" },
  { href: "/ventas/por-cobrar", etiqueta: "Por cobrar" },
  { href: "/ventas/clientes", etiqueta: "Clientes" },
];

export function NavVentas() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto">
      {PESTANAS.map((pestana) => {
        // "Ventas" también cubre /ventas/nueva y el detalle de cada venta.
        const activa =
          pestana.href === "/ventas"
            ? !pathname.startsWith("/ventas/por-cobrar") && !pathname.startsWith("/ventas/clientes")
            : pathname.startsWith(pestana.href);
        return (
          <Link
            key={pestana.href}
            href={pestana.href}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              activa ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            {pestana.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}

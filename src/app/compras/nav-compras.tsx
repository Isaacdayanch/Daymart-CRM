"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PESTANAS = [
  { href: "/compras", etiqueta: "Órdenes de compra" },
  { href: "/compras/por-recibir", etiqueta: "Por recibir" },
  { href: "/compras/proveedores", etiqueta: "Proveedores" },
];

export function NavCompras() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto">
      {PESTANAS.map((pestana) => {
        // "Órdenes" también cubre /compras/nueva y el detalle de cada orden.
        const activa =
          pestana.href === "/compras"
            ? !pathname.startsWith("/compras/por-recibir") && !pathname.startsWith("/compras/proveedores")
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PESTANAS = [
  { href: "/vendedores", etiqueta: "Vendedores" },
  { href: "/vendedores/precios", etiqueta: "Lista de precios" },
];

export function NavVendedores() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto">
      {PESTANAS.map((pestana) => {
        const activa = pestana.href === "/vendedores" ? !pathname.startsWith("/vendedores/precios") && !pathname.startsWith("/vendedores/imprimir") : pathname.startsWith(pestana.href);
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

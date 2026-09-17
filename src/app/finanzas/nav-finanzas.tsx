"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Orden pedido por Isaac (17 sep): lo que usa a diario primero. "Balance"
// no lo mencionó, se dejó al final.
const PESTANAS = [
  { href: "/finanzas", etiqueta: "Resumen" },
  { href: "/finanzas/movimientos", etiqueta: "Movimientos" },
  { href: "/finanzas/cuentas", etiqueta: "Cuentas" },
  { href: "/finanzas/proveedores", etiqueta: "Proveedores" },
  { href: "/finanzas/maaser", etiqueta: "Maaser" },
  { href: "/finanzas/facturas", etiqueta: "Facturas" },
  { href: "/finanzas/prestamistas", etiqueta: "Prestamistas" },
  { href: "/finanzas/socios", etiqueta: "Socios" },
  { href: "/finanzas/categorias", etiqueta: "Categorías" },
  { href: "/finanzas/balance", etiqueta: "Balance" },
];

export function NavFinanzas() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto">
      {PESTANAS.map((pestana) => {
        const activa = pestana.href === "/finanzas" ? pathname === "/finanzas" : pathname.startsWith(pestana.href);
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

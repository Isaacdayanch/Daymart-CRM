"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Se van a ir agregando pestañas conforme se construya el resto del módulo
// (Movimientos, Préstamos, Deudas...) — por ahora solo lo que ya existe.
const PESTANAS = [
  { href: "/finanzas", etiqueta: "Resumen" },
  { href: "/finanzas/movimientos", etiqueta: "Movimientos" },
  { href: "/finanzas/facturas", etiqueta: "Facturas" },
  { href: "/finanzas/socios", etiqueta: "Socios" },
  { href: "/finanzas/prestamistas", etiqueta: "Prestamistas" },
  { href: "/finanzas/proveedores", etiqueta: "Proveedores" },
  { href: "/finanzas/balance", etiqueta: "Balance" },
  { href: "/finanzas/maaser", etiqueta: "Maaser" },
  { href: "/finanzas/cuentas", etiqueta: "Cuentas" },
  { href: "/finanzas/categorias", etiqueta: "Categorías" },
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

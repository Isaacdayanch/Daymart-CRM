"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Rol } from "@/lib/tipos";

const PESTANAS = [
  { href: "/stock", etiqueta: "Resumen" },
  { href: "/stock/salidas", etiqueta: "Salidas" },
  { href: "/stock/movimientos", etiqueta: "Movimientos" },
  { href: "/stock/pendientes", etiqueta: "Pendiente en China" },
  { href: "/stock/agregar", etiqueta: "+ Agregar stock" },
  { href: "/stock/carga-masiva", etiqueta: "Carga masiva" },
  { href: "/stock/bodegas", etiqueta: "Bodegas" },
  { href: "/stock/configuracion", etiqueta: "Configuración" },
];

// Una operadora solo puede entrar a Salidas y Carga masiva (así lo decide
// también el middleware) — el resto ni se le muestra.
const PESTANAS_OPERADORA = new Set(["/stock/salidas", "/stock/carga-masiva"]);

export function NavStock({ rol }: { rol?: Rol }) {
  const pathname = usePathname();
  const pestanas = rol === "operadora" ? PESTANAS.filter((p) => PESTANAS_OPERADORA.has(p.href)) : PESTANAS;

  return (
    <nav className="flex gap-1 overflow-x-auto">
      {pestanas.map((pestana) => {
        const activa = pestana.href === "/stock" ? pathname === "/stock" : pathname.startsWith(pestana.href);
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

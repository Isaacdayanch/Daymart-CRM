"use client";

import { useRouter } from "next/navigation";
import type { CategoriaFinanciera } from "@/lib/tipos";
import { SelectorCategoria } from "../selector-categoria";

/** Filtro del libro por categoría: el mismo buscador de categorías del
 * registro, pero sin crear; al elegir cambia la URL (?categoria=). */
export function FiltroCategoria({ categorias, valor }: { categorias: CategoriaFinanciera[]; valor: string }) {
  const router = useRouter();
  return (
    <SelectorCategoria
      categorias={categorias}
      defaultId={valor}
      permitirCrear={false}
      placeholder="Filtrar por categoría…"
      onChange={(id) => router.push(id ? `/finanzas/movimientos?categoria=${id}` : "/finanzas/movimientos")}
    />
  );
}

"use client";

import type { Contenedor } from "@/lib/tipos";
import { restaurarContenedor, eliminarContenedorDefinitivo } from "./actions";

export function FilaPapelera({ contenedor }: { contenedor: Contenedor }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => restaurarContenedor(contenedor.id)}
        className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
      >
        Restaurar
      </button>
      <button
        type="button"
        onClick={() => {
          const escrito = prompt(
            `Esto borra el contenedor ${contenedor.numero} para siempre, sin poder recuperarlo. Escribe ${contenedor.numero} para confirmar.`,
          );
          if (escrito?.trim() === String(contenedor.numero)) {
            eliminarContenedorDefinitivo(contenedor.id);
          } else if (escrito !== null) {
            alert("No coincide el número, no se borró nada.");
          }
        }}
        className="text-sm font-medium text-red-600 hover:text-red-800"
      >
        Borrar definitivo
      </button>
    </div>
  );
}

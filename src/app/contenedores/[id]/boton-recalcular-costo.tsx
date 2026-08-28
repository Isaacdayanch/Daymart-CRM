"use client";

import { useState } from "react";
import { recalcularCostoEntradasContenedor } from "./actions";

export function BotonRecalcularCosto({ contenedorId }: { contenedorId: string }) {
  const [estado, setEstado] = useState<"listo" | "calculando" | "hecho">("listo");

  return (
    <button
      type="button"
      disabled={estado === "calculando"}
      onClick={async () => {
        setEstado("calculando");
        await recalcularCostoEntradasContenedor(contenedorId);
        setEstado("hecho");
        setTimeout(() => setEstado("listo"), 2000);
      }}
      className="text-xs font-medium text-zinc-500 transition hover:text-zinc-900 disabled:opacity-50"
    >
      {estado === "calculando" ? "Recalculando..." : estado === "hecho" ? "✓ Actualizado" : "Recalcular costo →"}
    </button>
  );
}

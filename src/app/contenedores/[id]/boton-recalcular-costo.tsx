"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recalcularCostoEntradasContenedor } from "./actions";

export function BotonRecalcularCosto({ contenedorId }: { contenedorId: string }) {
  const router = useRouter();
  const [calculando, setCalculando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={calculando}
        onClick={async () => {
          setCalculando(true);
          setMensaje(null);
          try {
            const resultado = await recalcularCostoEntradasContenedor(contenedorId);
            if (resultado.error) {
              setMensaje(`Error: ${resultado.error}`);
            } else if (resultado.regenerado) {
              setMensaje(
                `No tenía ninguna entrada guardada — se generaron ${resultado.actualizados} de ${resultado.total} de cero.`,
              );
            } else if (resultado.creados) {
              setMensaje(
                `${resultado.creados} producto(s) no tenían stock guardado (se agregaron después de recibir) — ya se crearon. En total: ${resultado.actualizados} de ${resultado.total} al día.`,
              );
            } else if (resultado.actualizados === 0 && resultado.total > 0) {
              setMensaje("No se encontró ningún movimiento de stock que actualizar.");
            } else {
              setMensaje(`Se actualizaron ${resultado.actualizados} de ${resultado.total} productos.`);
            }
            router.refresh();
          } catch (e) {
            setMensaje(`Error: ${e instanceof Error ? e.message : "no se pudo conectar."}`);
          } finally {
            setCalculando(false);
          }
        }}
        className="text-xs font-medium text-zinc-500 transition hover:text-zinc-900 disabled:opacity-50"
      >
        {calculando ? "Recalculando..." : "Recalcular costo →"}
      </button>
      {mensaje && (
        <p className={`text-xs ${mensaje.startsWith("Error") ? "text-red-600" : "text-zinc-500"}`}>{mensaje}</p>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { ZONA_MX } from "@/lib/fechas-mx";

/** Reloj en vivo en horario de Ciudad de México — para que Isaac compare a
 * simple vista contra la hora que ve en Mercado Libre y confirme que todo
 * cuadra, sin importar en qué zona esté su celular o el servidor. */
export function RelojMx() {
  const [hora, setHora] = useState<string | null>(null);

  useEffect(() => {
    function actualizar() {
      setHora(
        new Date().toLocaleString("es-MX", {
          timeZone: ZONA_MX,
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    }
    actualizar();
    const t = setInterval(actualizar, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-right shadow-sm">
      <p className="text-[11px] text-zinc-400">Hora en Ciudad de México</p>
      <p className="font-mono text-sm text-zinc-900">{hora ?? "…"}</p>
    </div>
  );
}

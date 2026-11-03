"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { traerDineroMp } from "./actions";

export function BotonTraer() {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function traer() {
    setTrabajando(true);
    setError(null);
    setMensaje(null);
    const r = await traerDineroMp();
    setTrabajando(false);
    if ("error" in r && r.error) {
      setError(r.error);
      return;
    }
    if ("ok" in r) {
      const partes: string[] = [];
      if (r.importados) partes.push(`Cargué ${r.importados} ${r.importados === 1 ? "reporte" : "reportes"} (${r.renglones.toLocaleString("es-MX")} movimientos, ${r.ventas.toLocaleString("es-MX")} ventas con dato exacto).`);
      if (r.pedido) partes.push("Le pedí a Mercado Pago el reporte que falta: lo genera en unos minutos. Vuelve a picarle en un rato, o se carga solo.");
      else if (r.pendiente) partes.push("Mercado Pago todavía está generando el reporte que pedí: en unos minutos se carga solo.");
      if (!partes.length) partes.push("Todo al día: no hay reportes nuevos.");
      setMensaje(partes.join(" "));
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={traer}
        disabled={trabajando}
        className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-60"
      >
        {trabajando && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
        {trabajando ? "Hablando con Mercado Pago…" : "Traer de Mercado Pago"}
      </button>
      {mensaje && <p className="text-sm text-emerald-700">{mensaje}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

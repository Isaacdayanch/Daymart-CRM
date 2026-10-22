"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { actualizarBandeja } from "./actions";

/** Al abrir la pantalla trae las preguntas nuevas de ML y redacta los
 * borradores que falten; luego refresca. También hay botón para repetirlo. */
export function ActualizarBandeja() {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState(false);
  const [texto, setTexto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const yaCorrio = useRef(false);

  async function correr() {
    setTrabajando(true);
    setError(null);
    const r = await actualizarBandeja();
    setTrabajando(false);
    if ("error" in r && r.error) {
      setError(r.error);
      return;
    }
    if ("ok" in r) {
      const partes = [`${r.sinResponder} sin responder en Mercado Libre`];
      if (r.nuevas) partes.push(`${r.nuevas} nuevas`);
      if (r.redactadas) partes.push(`${r.redactadas} borradores listos`);
      if (r.errores) partes.push(`${r.errores} no se pudieron redactar`);
      if (r.topeAlcanzado) partes.push("se llegó al tope de hoy");
      setTexto(partes.join(" · "));
    }
    router.refresh();
  }

  useEffect(() => {
    if (yaCorrio.current) return;
    yaCorrio.current = true;
    void correr();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button
        type="button"
        onClick={correr}
        disabled={trabajando}
        className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
      >
        {trabajando && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />}
        {trabajando ? "Buscando preguntas y redactando…" : "Buscar preguntas nuevas"}
      </button>
      {texto && !trabajando && <span className="text-zinc-400">{texto}</span>}
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}

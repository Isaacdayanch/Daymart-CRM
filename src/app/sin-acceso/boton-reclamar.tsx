"use client";

import { useState } from "react";
import { reclamarAccesoDeDueno } from "./actions";

export function BotonReclamar() {
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  return (
    <div>
      <button
        type="button"
        disabled={enviando}
        onClick={async () => {
          setEnviando(true);
          const resultado = await reclamarAccesoDeDueno();
          if (resultado?.error) {
            setError(resultado.error);
            setEnviando(false);
          }
        }}
        className="w-full rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 disabled:opacity-50"
      >
        {enviando ? "Un momento..." : "Soy el dueño — darme acceso"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

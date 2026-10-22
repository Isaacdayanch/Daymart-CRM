"use client";

import { useState } from "react";
import { descartar } from "./actions";

export function VolverABandeja({ id }: { id: number }) {
  const [trabajando, setTrabajando] = useState(false);
  return (
    <button
      type="button"
      disabled={trabajando}
      onClick={async () => {
        setTrabajando(true);
        await descartar(id, true);
        setTrabajando(false);
      }}
      className="shrink-0 text-xs font-medium text-zinc-500 hover:text-zinc-900 disabled:opacity-50"
    >
      {trabajando ? "…" : "regresar a la bandeja"}
    </button>
  );
}

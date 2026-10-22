"use client";

import { useEffect } from "react";

/** Al picar un número en el historial (#envio-…), abre los desplegables que
 * lo contienen (ej. "Envíos cerrados") y baja hasta la tarjeta. */
export function AbrirAncla() {
  useEffect(() => {
    function abrir() {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      for (let p: HTMLElement | null = el; p; p = p.parentElement) if (p instanceof HTMLDetailsElement) p.open = true;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    abrir();
    window.addEventListener("hashchange", abrir);
    return () => window.removeEventListener("hashchange", abrir);
  }, []);
  return null;
}

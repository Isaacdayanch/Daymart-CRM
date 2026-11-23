"use client";

// Montos "tapados" en el inicio (Isaac, 23 nov: "los números en grande que
// por default se vean tapados y yo los destapo, con diseño padre"). Un solo
// interruptor para toda la pantalla: el ojo de arriba o un toque sobre
// cualquier monto los destapa todos (y otro toque los vuelve a tapar).
// Arranca tapado en cada visita a propósito: no se guarda la preferencia.

import { createContext, useContext, useState, type ReactNode } from "react";

interface Privacidad {
  visible: boolean;
  alternar: () => void;
}

const Contexto = createContext<Privacidad | null>(null);

export function PrivacidadMontos({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  return (
    <Contexto.Provider
      value={{ visible, alternar: () => setVisible((v) => !v) }}
    >
      {children}
    </Contexto.Provider>
  );
}

/** Envuelve un monto: tapado se ve borroso y gris, sin poderse copiar; un
 * toque lo destapa con una transición suave. Fuera del proveedor se muestra
 * normal (por si se reutiliza en otra pantalla sin interruptor). */
export function MontoOculto({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ctx = useContext(Contexto);
  if (!ctx) return <span className={className}>{children}</span>;
  const { visible, alternar } = ctx;
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={visible ? "Ocultar montos" : "Mostrar montos"}
      title={visible ? "Toca para ocultar" : "Toca para ver"}
      className={`inline-block rounded-lg text-left transition-[filter,opacity,transform] duration-500 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 ${
        visible
          ? "cursor-pointer"
          : "cursor-pointer select-none opacity-60 blur-[9px] saturate-0 hover:blur-[7px]"
      } ${className}`}
    >
      <span aria-hidden={!visible}>{children}</span>
      {!visible && <span className="sr-only">Monto oculto</span>}
    </button>
  );
}

function IconoOjo({ abierto }: { abierto: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="transition-transform duration-300"
    >
      <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
      <circle
        cx="12"
        cy="12"
        r="2.8"
        className={`transition-opacity duration-300 ${abierto ? "opacity-100" : "opacity-0"}`}
      />
      <path
        d="M4 4l16 16"
        className={`transition-opacity duration-300 ${abierto ? "opacity-0" : "opacity-100"}`}
      />
    </svg>
  );
}

/** El interruptor general: ojo + "Mostrar montos" / "Ocultar montos". */
export function BotonOjo() {
  const ctx = useContext(Contexto);
  if (!ctx) return null;
  return (
    <button
      type="button"
      onClick={ctx.alternar}
      className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm transition hover:border-zinc-300 hover:text-zinc-900 active:scale-[0.97]"
    >
      <IconoOjo abierto={ctx.visible} />
      {ctx.visible ? "Ocultar montos" : "Mostrar montos"}
    </button>
  );
}

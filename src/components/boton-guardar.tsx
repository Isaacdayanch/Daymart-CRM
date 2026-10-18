"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * Botón de guardar/registrar de TODO el sistema (Isaac, 18 oct: "a veces le
 * pico dos veces y no sé cuándo ya le piqué… algo súper elegante").
 *
 * Tres estados, sin brincos de tamaño (las tres etiquetas viven apiladas en
 * la misma celda y solo cambia cuál se ve):
 * 1. Normal: se hunde un poquito al picarle (`active:scale`), como un botón
 *    de verdad.
 * 2. Guardando: en cuanto el formulario manda, el botón se bloquea solo (no
 *    hay segundo clic posible), baja un poco la opacidad y muestra un anillo
 *    girando con "Guardando…". Lo sabe por `useFormStatus` (el formulario
 *    que lo contiene está mandando una acción del servidor) o por la prop
 *    `cargando` (formularios que llevan su propio estado).
 * 3. Listo: al terminar sin error, se pone verde con una palomita que se
 *    dibuja (trazo animado) durante 1.4 s y regresa a normal. Si el
 *    formulario pintó un error (texto rojo), no se muestra "Listo".
 */
export function BotonGuardar({
  children,
  textoCargando = "Guardando…",
  textoListo = "Listo",
  cargando = false,
  disabled = false,
  mostrarListo = true,
  className = "",
  onClick,
  ...rest
}: {
  children: ReactNode;
  /** Texto mientras trabaja (ej. "Registrando…", "Creando…"). */
  textoCargando?: string;
  /** Texto del estado verde al terminar. */
  textoListo?: string;
  /** Para formularios que manejan su propio estado de envío (además de useFormStatus). */
  cargando?: boolean;
  disabled?: boolean;
  /** false = nunca mostrar el estado verde (ej. si la pantalla cambia de página al terminar). */
  mostrarListo?: boolean;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "children" | "className" | "disabled">) {
  const { pending } = useFormStatus();
  const ocupado = pending || cargando;
  const [listo, setListo] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const estabaOcupado = useRef(false);

  useEffect(() => {
    if (ocupado) {
      estabaOcupado.current = true;
      return;
    }
    if (!estabaOcupado.current) return;
    estabaOcupado.current = false;
    if (!mostrarListo) return;
    // Si el formulario pintó un error (los errores del sistema van en texto
    // rojo), no se festeja nada.
    const form = ref.current?.closest("form");
    const hayError = form ? Array.from(form.querySelectorAll(".text-red-600, .text-red-700, .text-red-800, [role=alert]")).some((el) => (el.textContent ?? "").trim().length > 0) : false;
    if (hayError) return;
    setListo(true);
    const t = setTimeout(() => setListo(false), 1400);
    return () => clearTimeout(t);
  }, [ocupado, mostrarListo]);

  const estado = ocupado ? "cargando" : listo ? "listo" : "normal";
  // Las clases del botón original (color, tamaño) se respetan; aquí solo va
  // el comportamiento común. Los `data-[estado=…]` ganan sobre el color base
  // porque llevan atributo además de clase.
  const base =
    "relative select-none transition-[transform,opacity,background-color,box-shadow,filter] duration-150 ease-out " +
    "active:scale-[0.97] active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 " +
    "disabled:cursor-not-allowed data-[estado=normal]:disabled:opacity-50 " +
    "data-[estado=cargando]:cursor-progress data-[estado=cargando]:opacity-85 data-[estado=cargando]:scale-[0.98] " +
    "data-[estado=listo]:bg-emerald-600 data-[estado=listo]:text-white data-[estado=listo]:hover:bg-emerald-600 data-[estado=listo]:shadow-[0_0_0_4px_rgba(16,185,129,0.18)]";

  return (
    <button
      ref={ref}
      type="submit"
      disabled={ocupado || listo || disabled}
      aria-busy={ocupado}
      data-estado={estado}
      className={`${base} ${className}`}
      onClick={(e) => {
        if (ocupado || listo) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      {...rest}
    >
      <span className="grid place-items-center">
        <span className={`col-start-1 row-start-1 inline-flex items-center gap-2 transition-opacity duration-150 ${estado === "normal" ? "opacity-100" : "opacity-0"}`}>{children}</span>
        <span aria-hidden={estado !== "cargando"} className={`col-start-1 row-start-1 inline-flex items-center gap-2 whitespace-nowrap transition-opacity duration-150 ${estado === "cargando" ? "opacity-100" : "opacity-0"}`}>
          <Anillo />
          {textoCargando}
        </span>
        <span aria-hidden={estado !== "listo"} className={`col-start-1 row-start-1 inline-flex items-center gap-2 whitespace-nowrap transition-opacity duration-150 ${estado === "listo" ? "opacity-100" : "opacity-0"}`}>
          {estado === "listo" && <Palomita />}
          {textoListo}
        </span>
      </span>
    </button>
  );
}

/** Anillo que gira: un arco de 270° en el color del texto del botón. */
function Anillo() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 animate-spin" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Palomita que se dibuja (trazo animado, ver `@keyframes trazo-palomita` en globals.css). */
function Palomita() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="palomita-trazo" />
    </svg>
  );
}

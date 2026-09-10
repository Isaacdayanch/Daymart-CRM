"use client";

import { useRef, useState } from "react";

interface CampoMontoProps {
  name?: string;
  id?: string;
  defaultValue?: number;
  /** Modo controlado (como CampoSugerencias): si se manda `value`, el
   * valor real vive en el componente padre y aquí solo se muestra/edita. */
  value?: string;
  onChange?: (valor: string) => void;
  required?: boolean;
  className?: string;
  placeholder?: string;
}

function limpiar(entrada: string): string {
  let crudo = entrada.replace(/[^0-9.]/g, "");
  const primerPunto = crudo.indexOf(".");
  if (primerPunto !== -1) {
    crudo = crudo.slice(0, primerPunto + 1) + crudo.slice(primerPunto + 1).replace(/\./g, "");
  }
  return crudo;
}

function formatear(crudo: string): string {
  if (!crudo) return "";
  const [entero, decimal] = crudo.split(".");
  const enteroFmt = entero === "" ? "" : Number(entero).toLocaleString("es-MX");
  return decimal !== undefined ? `${enteroFmt}.${decimal}` : enteroFmt;
}

/** Cuenta cuántos caracteres de VALOR (dígitos o punto) hay antes del
 * cursor, para poder recolocarlo después de reformatear con comas. */
function contarValorHastaCursor(texto: string, cursor: number): number {
  return texto.slice(0, cursor).replace(/[^0-9.]/g, "").length;
}

function posicionParaValor(formateado: string, cuenta: number): number {
  if (cuenta <= 0) return 0;
  let vistos = 0;
  for (let i = 0; i < formateado.length; i++) {
    if (/[0-9.]/.test(formateado[i])) {
      vistos++;
      if (vistos === cuenta) return i + 1;
    }
  }
  return formateado.length;
}

/**
 * Input para montos de dinero: signo de $ fijo a la izquierda y separador
 * de miles en automático MIENTRAS se escribe (no solo al salir del
 * campo) — así nunca se pierde cuántos ceros lleva un monto grande.
 * Funciona controlado (value + onChange) o sin controlar (defaultValue +
 * name, como CampoNumero/Selector) — el valor real que se manda al
 * formulario siempre es el número limpio, sin comas.
 */
export function CampoMonto({
  name,
  id,
  defaultValue,
  value,
  onChange,
  required,
  className,
  placeholder,
}: CampoMontoProps) {
  const esControlado = value !== undefined;
  const [valorInterno, setValorInterno] = useState(defaultValue !== undefined ? String(defaultValue) : "");
  const valor = esControlado ? value : valorInterno;
  const inputRef = useRef<HTMLInputElement>(null);

  function manejarCambio(e: React.ChangeEvent<HTMLInputElement>) {
    const cursor = e.target.selectionStart ?? e.target.value.length;
    const cuenta = contarValorHastaCursor(e.target.value, cursor);
    const crudo = limpiar(e.target.value);

    if (esControlado) onChange?.(crudo);
    else setValorInterno(crudo);

    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      const nuevaPos = posicionParaValor(formatear(crudo), cuenta);
      el.setSelectionRange(nuevaPos, nuevaPos);
    });
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-zinc-400">
        $
      </span>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        id={id}
        required={required}
        placeholder={placeholder ?? "0"}
        value={formatear(valor)}
        onChange={manejarCambio}
        style={{ paddingLeft: "1.6rem" }}
        className={className}
      />
      {name && <input type="hidden" name={name} value={valor} />}
    </div>
  );
}

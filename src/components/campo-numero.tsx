"use client";

import { useState } from "react";

interface CampoNumeroProps {
  name: string;
  id?: string;
  defaultValue?: number;
  required?: boolean;
  className?: string;
}

/**
 * Input de dinero/tipo de cambio: empieza vacío (no en 0) y muestra
 * separadores de miles cuando no se está escribiendo en él.
 */
export function CampoNumero({ name, id, defaultValue, required, className }: CampoNumeroProps) {
  const inicial = defaultValue ? String(defaultValue) : "";
  const [valor, setValor] = useState(inicial);
  const [enfocado, setEnfocado] = useState(false);

  const mostrado =
    enfocado || !valor
      ? valor
      : Number(valor).toLocaleString("es-MX", { maximumFractionDigits: 2 });

  return (
    <>
      <input
        type="text"
        inputMode="decimal"
        id={id}
        required={required}
        placeholder="0"
        value={mostrado}
        onFocus={() => setEnfocado(true)}
        onBlur={() => setEnfocado(false)}
        onChange={(e) => setValor(e.target.value.replace(/[^0-9.]/g, ""))}
        className={className}
      />
      <input type="hidden" name={name} value={valor} />
    </>
  );
}

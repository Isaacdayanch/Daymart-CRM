"use client";

import { useEffect, useRef, useState } from "react";

const DIAS = ["L", "M", "M", "J", "V", "S", "D"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function aFecha(texto: string) {
  const [y, m, d] = texto.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function aTexto(fecha: Date) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

function formatoBonito(texto: string) {
  return aFecha(texto).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

/** Selector de fecha con calendario propio — reemplaza el <input
 * type="date">, cuyo desplegable es el del sistema operativo (chiquito y
 * no se puede personalizar). Funciona "sin controlar" como el resto de los
 * campos: el valor vive dentro del componente y se manda con un input
 * oculto. */
export function CampoFecha({
  name,
  defaultValue,
  max,
  onChange,
  required,
}: {
  name?: string;
  defaultValue?: string;
  max?: string;
  onChange?: (valor: string) => void;
  required?: boolean;
}) {
  const hoyTexto = aTexto(new Date());
  const [valor, setValor] = useState(defaultValue ?? "");
  const [abierto, setAbierto] = useState(false);
  const [mesVisible, setMesVisible] = useState(() => aFecha(defaultValue || max || hoyTexto));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function alClicFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    function alEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", alClicFuera);
    document.addEventListener("keydown", alEscape);
    return () => {
      document.removeEventListener("mousedown", alClicFuera);
      document.removeEventListener("keydown", alEscape);
    };
  }, []);

  const maxFecha = max ? aFecha(max) : undefined;
  const primerDiaMes = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), 1);
  const diasEnMes = new Date(mesVisible.getFullYear(), mesVisible.getMonth() + 1, 0).getDate();
  const offsetInicio = (primerDiaMes.getDay() + 6) % 7; // lunes = 0

  const celdas: (Date | null)[] = [
    ...Array.from({ length: offsetInicio }, () => null),
    ...Array.from({ length: diasEnMes }, (_, i) => new Date(mesVisible.getFullYear(), mesVisible.getMonth(), i + 1)),
  ];

  function elegir(fecha: Date) {
    const texto = aTexto(fecha);
    setValor(texto);
    onChange?.(texto);
    setAbierto(false);
  }

  function cambiarMes(delta: number) {
    setMesVisible((actual) => new Date(actual.getFullYear(), actual.getMonth() + delta, 1));
  }

  return (
    <div ref={ref} className="relative">
      {name && <input type="hidden" name={name} value={valor} required={required} />}
      <button
        type="button"
        onClick={() => {
          setMesVisible(aFecha(valor || max || hoyTexto));
          setAbierto((v) => !v);
        }}
        className="mt-1.5 flex w-full items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-left text-sm transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 focus:outline-none"
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="shrink-0 text-zinc-400">
          <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
          <path d="M2 6.5h12M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <span className={valor ? "text-zinc-900" : "text-zinc-400"}>
          {valor ? formatoBonito(valor) : "Selecciona una fecha"}
        </span>
      </button>

      {abierto && (
        <div className="absolute z-20 mt-1.5 w-72 overflow-hidden rounded-2xl border border-black/5 bg-white/95 p-3 shadow-xl ring-1 ring-black/5 backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => cambiarMes(-1)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100"
              aria-label="Mes anterior"
            >
              ‹
            </button>
            <p className="text-sm font-medium text-zinc-900 capitalize">
              {MESES[mesVisible.getMonth()]} {mesVisible.getFullYear()}
            </p>
            <button
              type="button"
              onClick={() => cambiarMes(1)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100"
              aria-label="Mes siguiente"
            >
              ›
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-medium text-zinc-400">
            {DIAS.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1">
            {celdas.map((fecha, i) => {
              if (!fecha) return <span key={i} />;
              const texto = aTexto(fecha);
              const esFuturo = maxFecha ? fecha > maxFecha : false;
              const esHoy = texto === hoyTexto;
              const esSeleccionado = texto === valor;
              return (
                <div key={i} className="flex justify-center">
                  <button
                    type="button"
                    disabled={esFuturo}
                    onClick={() => elegir(fecha)}
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm transition ${
                      esSeleccionado
                        ? "bg-zinc-900 font-medium text-white"
                        : esFuturo
                          ? "cursor-not-allowed text-zinc-300"
                          : esHoy
                            ? "font-medium text-zinc-900 ring-1 ring-zinc-300"
                            : "text-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    {fecha.getDate()}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex justify-end border-t border-zinc-100 pt-2">
            <button
              type="button"
              onClick={() => elegir(new Date())}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-900"
            >
              Hoy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

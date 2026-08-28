"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ESTADOS_CONTENEDOR, type EstadoContenedor } from "@/lib/tipos";
import { ESTILO_ESTADO } from "@/lib/formato";
import { cambiarEstado } from "./actions";

export function TarjetaEstado({
  contenedorId,
  estado,
  stockGeneradoEn,
}: {
  contenedorId: string;
  estado: EstadoContenedor;
  stockGeneradoEn: string | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const etiqueta = ESTADOS_CONTENEDOR.find((e) => e.valor === estado)?.etiqueta ?? estado;

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

  function alCambiar(nuevoEstado: EstadoContenedor) {
    setAbierto(false);
    // Recibir en bodega ya no es un clic simple: hay que confirmar cuánto
    // llegó de verdad y eso genera el stock automático.
    if (nuevoEstado === "RECIBIDO_BODEGA" && !stockGeneradoEn) {
      router.push(`/contenedores/${contenedorId}/recibir`);
      return;
    }
    cambiarEstado(contenedorId, nuevoEstado);
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xs text-zinc-500">Estado</p>
      <div ref={ref} className="relative mt-1">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className={`flex w-full items-center justify-between gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition focus:ring-2 ${ESTILO_ESTADO[estado]}`}
        >
          {etiqueta}
          <svg width="10" height="10" viewBox="0 0 14 14" fill="none" className={`shrink-0 transition-transform ${abierto ? "rotate-180" : ""}`}>
            <path d="M3.5 5.5 7 9l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {abierto && (
          <div className="absolute z-20 mt-1.5 w-48 overflow-hidden rounded-2xl border border-black/5 bg-white/95 py-1 shadow-xl ring-1 ring-black/5 backdrop-blur-sm">
            {ESTADOS_CONTENEDOR.map((e) => (
              <button
                key={e.valor}
                type="button"
                onClick={() => alCambiar(e.valor)}
                className="flex w-full items-center px-2.5 py-1.5 text-left transition hover:bg-zinc-100"
              >
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${ESTILO_ESTADO[e.valor]}`}
                >
                  {e.etiqueta}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          const el = document.getElementById("documentacion") as HTMLDetailsElement | null;
          if (el) {
            el.open = true;
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }}
        className="mt-2 text-xs font-medium text-zinc-500 hover:text-zinc-900"
      >
        📄 Ver documentación
      </button>
    </div>
  );
}

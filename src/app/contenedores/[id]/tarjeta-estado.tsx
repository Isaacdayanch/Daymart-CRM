"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { ESTADOS_CONTENEDOR, type EstadoContenedor } from "@/lib/tipos";
import { ESTILO_ESTADO } from "@/lib/formato";
import { cambiarEstado } from "./actions";

export function TarjetaEstado({
  contenedorId,
  estado,
  stockGeneradoEn,
  creditoDias = null,
  soloLectura = false,
}: {
  contenedorId: string;
  estado: EstadoContenedor;
  stockGeneradoEn: string | null;
  /** Si el proveedor dio crédito, al pasar a "En tránsito" se pregunta la
   * fecha exacta de salida — de ahí corren los días de crédito. */
  creditoDias?: number | null;
  soloLectura?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pidiendoSalida, setPidiendoSalida] = useState(false);
  const hoyTexto = new Date().toISOString().slice(0, 10);
  const [fechaSalida, setFechaSalida] = useState(hoyTexto);
  const [guardando, setGuardando] = useState(false);
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
    // Con crédito del proveedor, la fecha de salida importa: de ahí corren
    // los días — se confirma antes de guardar (hoy por defecto, editable).
    if (nuevoEstado === "EN_TRANSITO" && creditoDias && creditoDias > 0) {
      setPidiendoSalida(true);
      return;
    }
    cambiarEstado(contenedorId, nuevoEstado);
  }

  if (pidiendoSalida) {
    const limite = new Date(`${fechaSalida}T12:00:00`);
    limite.setDate(limite.getDate() + (creditoDias ?? 0));
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-xs font-medium text-amber-900">¿Qué día salió de China?</p>
        <div className="mt-1.5">
          <CampoFecha defaultValue={fechaSalida} onChange={setFechaSalida} max={hoyTexto} />
        </div>
        <p className="mt-1.5 text-[11px] text-amber-800">
          Con {creditoDias} días de crédito, el pago vence el{" "}
          <span className="font-medium">{limite.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}</span>.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={guardando}
            onClick={async () => {
              setGuardando(true);
              await cambiarEstado(contenedorId, "EN_TRANSITO", fechaSalida);
              setGuardando(false);
              setPidiendoSalida(false);
              router.refresh();
            }}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Confirmar salida"}
          </button>
          <button type="button" onClick={() => setPidiendoSalida(false)} className="text-xs text-zinc-500 hover:text-zinc-900">
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xs text-zinc-500">Estado</p>
      <div ref={ref} className="relative mt-1">
        {soloLectura ? (
          <span
            className={`flex w-full items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${ESTILO_ESTADO[estado]}`}
          >
            {etiqueta}
          </span>
        ) : (
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
        )}
        {!soloLectura && abierto && (
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

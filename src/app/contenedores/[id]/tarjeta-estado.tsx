"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { ESTADOS_CONTENEDOR, type EstadoContenedor } from "@/lib/tipos";
import { ESTILO_ESTADO } from "@/lib/formato";
import { diasHasta, ESTADOS_EN_CAMINO, formatoFechaCorta } from "@/lib/avisos-contenedores";
import { cambiarEstado, guardarFechaLlegada } from "./actions";

export function TarjetaEstado({
  contenedorId,
  estado,
  stockGeneradoEn,
  creditoDias = null,
  fechaEstimadaLlegada = null,
  soloLectura = false,
}: {
  contenedorId: string;
  estado: EstadoContenedor;
  stockGeneradoEn: string | null;
  /** Si el proveedor dio crédito, al pasar a "En tránsito" se pregunta la
   * fecha exacta de salida — de ahí corren los días de crédito. */
  creditoDias?: number | null;
  /** Fecha estimada de llegada (YYYY-MM-DD) para el aviso de "por llegar". */
  fechaEstimadaLlegada?: string | null;
  soloLectura?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pidiendoSalida, setPidiendoSalida] = useState(false);
  const hoyTexto = new Date().toISOString().slice(0, 10);
  const [fechaSalida, setFechaSalida] = useState(hoyTexto);
  const [fechaLlegada, setFechaLlegada] = useState(fechaEstimadaLlegada ?? "");
  const [editandoLlegada, setEditandoLlegada] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const etiqueta = ESTADOS_CONTENEDOR.find((e) => e.valor === estado)?.etiqueta ?? estado;
  const enCamino = ESTADOS_EN_CAMINO.includes(estado);
  const diasLlegada = fechaEstimadaLlegada ? diasHasta(fechaEstimadaLlegada, hoyTexto) : null;

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

  async function aplicar(nuevoEstado: EstadoContenedor, salida?: string, llegada?: string | null) {
    setGuardando(true);
    setError(null);
    const r = await cambiarEstado(contenedorId, nuevoEstado, salida, llegada);
    setGuardando(false);
    if (r?.error) setError(r.error);
    router.refresh();
  }

  function alCambiar(nuevoEstado: EstadoContenedor) {
    setAbierto(false);
    // Recibir en bodega ya no es un clic simple: hay que confirmar cuánto
    // llegó de verdad y eso genera el stock automático.
    if (nuevoEstado === "RECIBIDO_BODEGA" && !stockGeneradoEn) {
      router.push(`/contenedores/${contenedorId}/recibir`);
      return;
    }
    // La fecha de salida de China siempre se confirma (hoy por defecto,
    // editable): es la fecha real del embarque y, si hay crédito del
    // proveedor, de ahí corren los días.
    if (nuevoEstado === "EN_TRANSITO") {
      setPidiendoSalida(true);
      return;
    }
    void aplicar(nuevoEstado);
  }

  if (pidiendoSalida) {
    const tieneCredito = Boolean(creditoDias && creditoDias > 0);
    const limite = new Date(`${fechaSalida}T12:00:00`);
    limite.setDate(limite.getDate() + (creditoDias ?? 0));
    return (
      <div className="col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:col-span-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-amber-900">¿Qué día salió de China?</p>
            <div className="mt-1.5">
              <CampoFecha defaultValue={fechaSalida} onChange={setFechaSalida} max={hoyTexto} />
            </div>
            {tieneCredito ? (
              <p className="mt-1.5 text-[11px] text-amber-800">
                Con {creditoDias} días de crédito, el pago vence el{" "}
                <span className="font-medium">{limite.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}</span>.
              </p>
            ) : (
              <p className="mt-1.5 text-[11px] text-amber-800">
                Sin crédito del proveedor. Si este contenedor viene a crédito, cancela y primero ponle los &ldquo;Días de
                crédito&rdquo; en Editar (abajo de Proveedor principal).
              </p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-amber-900">¿Cuándo llega aprox.? (opcional)</p>
            <div className="mt-1.5">
              <CampoFecha defaultValue={fechaLlegada} onChange={setFechaLlegada} />
            </div>
            <p className="mt-1.5 text-[11px] text-amber-800">Cuando falten 7 días o menos te aviso en Contenedores y en el inicio.</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={guardando}
            onClick={async () => {
              await aplicar("EN_TRANSITO", fechaSalida, fechaLlegada || null);
              setPidiendoSalida(false);
            }}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Confirmar salida"}
          </button>
          <button type="button" onClick={() => setPidiendoSalida(false)} className="text-xs text-zinc-500 hover:text-zinc-900">
            Cancelar
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
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
          disabled={guardando}
          onClick={() => setAbierto((v) => !v)}
          className={`flex w-full items-center justify-between gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition focus:ring-2 disabled:opacity-60 ${ESTILO_ESTADO[estado]}`}
        >
          {guardando ? "Guardando…" : etiqueta}
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
      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}

      {/* Fecha estimada de llegada: se ve mientras el contenedor va en camino. */}
      {(enCamino || fechaEstimadaLlegada) && !editandoLlegada && (
        <p className={`mt-2 text-[11px] ${diasLlegada !== null && diasLlegada < 0 && enCamino ? "text-amber-700" : "text-zinc-500"}`}>
          {fechaEstimadaLlegada ? (
            <>
              Llega aprox. <span className="font-medium">{formatoFechaCorta(fechaEstimadaLlegada)}</span>
              {enCamino && diasLlegada !== null && <> · {diasLlegada < 0 ? `hace ${-diasLlegada} día(s)` : diasLlegada === 0 ? "hoy" : `en ${diasLlegada} día(s)`}</>}
            </>
          ) : (
            "Sin fecha estimada de llegada"
          )}
          {!soloLectura && (
            <>
              {" · "}
              <button type="button" onClick={() => setEditandoLlegada(true)} className="text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline">
                {fechaEstimadaLlegada ? "cambiar" : "ponerla"}
              </button>
            </>
          )}
        </p>
      )}
      {editandoLlegada && (
        <div className="mt-2 space-y-1.5">
          <p className="text-[11px] text-zinc-500">Fecha estimada de llegada</p>
          <CampoFecha defaultValue={fechaLlegada} onChange={setFechaLlegada} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={guardando}
              onClick={async () => {
                setGuardando(true);
                setError(null);
                const r = await guardarFechaLlegada(contenedorId, fechaLlegada || null);
                setGuardando(false);
                if (r.error) setError(r.error);
                else {
                  setEditandoLlegada(false);
                  router.refresh();
                }
              }}
              className="rounded-lg bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              Guardar
            </button>
            {fechaEstimadaLlegada && (
              <button
                type="button"
                onClick={async () => {
                  const r = await guardarFechaLlegada(contenedorId, null);
                  if (r.error) setError(r.error);
                  else {
                    setFechaLlegada("");
                    setEditandoLlegada(false);
                    router.refresh();
                  }
                }}
                className="text-[11px] text-zinc-400 hover:text-red-600"
              >
                quitar
              </button>
            )}
            <button type="button" onClick={() => setEditandoLlegada(false)} className="text-[11px] text-zinc-500 hover:text-zinc-900">
              Cancelar
            </button>
          </div>
        </div>
      )}

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

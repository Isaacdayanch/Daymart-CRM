"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sincronizarVentasPagina } from "./actions";

// El avance se guarda en el navegador: si Isaac cierra la laptop o la
// pestaña a medio camino, al volver puede continuar donde se quedó.
const CLAVE_PROGRESO = "daymart_ml_sync_ventas";

interface Progreso {
  diasAtras?: number;
  offset: number;
  desdeIso?: string;
  /** Tope de fecha de la ventana actual (Mercado Libre no deja pasar de la orden 10,000). */
  hastaIso?: string;
  guardadas: number;
  total: number | null;
}

function leerProgreso(): Progreso | null {
  try {
    const crudo = window.localStorage.getItem(CLAVE_PROGRESO);
    return crudo ? (JSON.parse(crudo) as Progreso) : null;
  } catch {
    return null;
  }
}

function guardarProgreso(p: Progreso | null) {
  try {
    if (p) window.localStorage.setItem(CLAVE_PROGRESO, JSON.stringify(p));
    else window.localStorage.removeItem(CLAVE_PROGRESO);
  } catch {
    // sin almacenamiento local: solo se pierde la reanudación
  }
}

export function BotonSincronizar({ conectado, primeraVez }: { conectado: boolean; primeraVez: boolean }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [avance, setAvance] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<Progreso | null>(null);

  useEffect(() => {
    // Se lee el avance guardado en el navegador al montar (fuera del render,
    // porque en el servidor no existe localStorage).
    const guardado = leerProgreso();
    if (guardado) {
      const id = window.setTimeout(() => setPendiente(guardado), 0);
      return () => window.clearTimeout(id);
    }
  }, []);

  /** Va página por página (50 órdenes cada una) hasta terminar; si se
   * interrumpe, el progreso queda guardado para continuar después. */
  async function correr(inicio: Progreso) {
    setCargando(true);
    setMensaje(null);
    setAvance("Conectando con Mercado Libre…");
    let progreso: Progreso = { ...inicio };
    let offset: number | undefined = progreso.offset;
    while (offset !== undefined) {
      const r = await sincronizarVentasPagina({ diasAtras: progreso.diasAtras, offset, desdeIso: progreso.desdeIso, hastaIso: progreso.hastaIso });
      if (r.error) {
        guardarProgreso(progreso);
        setPendiente(progreso);
        setMensaje(`Error: ${r.error}. Puedes continuar donde se quedó.`);
        setCargando(false);
        setAvance(null);
        router.refresh();
        return;
      }
      progreso = {
        ...progreso,
        desdeIso: r.desdeIso,
        hastaIso: r.hastaIso,
        guardadas: progreso.guardadas + r.guardadas,
        // El total general solo lo da la primera ventana; después se conserva.
        total: progreso.total ?? r.total,
        offset: r.siguiente ?? progreso.offset,
      };
      if (r.siguiente === null) {
        offset = undefined;
      } else {
        offset = r.siguiente;
        guardarProgreso(progreso);
      }
      setAvance(`${progreso.guardadas.toLocaleString("es-MX")}${progreso.total ? ` de ${progreso.total.toLocaleString("es-MX")}` : ""} órdenes…`);
    }
    guardarProgreso(null);
    setPendiente(null);
    setCargando(false);
    setAvance(null);
    setMensaje(`Listo: ${progreso.guardadas.toLocaleString("es-MX")} órdenes actualizadas.`);
    router.refresh();
  }

  const nuevo = (diasAtras?: number): Progreso => ({ diasAtras, offset: 0, guardadas: 0, total: null });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {pendiente && !cargando && (
          <button
            type="button"
            disabled={!conectado}
            onClick={() => correr(pendiente)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Continuar donde se quedó ({pendiente.guardadas.toLocaleString("es-MX")}
            {pendiente.total ? ` de ${pendiente.total.toLocaleString("es-MX")}` : ""})
          </button>
        )}
        <button
          type="button"
          disabled={!conectado || cargando}
          onClick={() => correr(nuevo())}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {cargando ? "Sincronizando…" : primeraVez ? "Traer mis ventas (últimos 60 días)" : "Sincronizar"}
        </button>
        <button
          type="button"
          disabled={!conectado || cargando}
          onClick={() => {
            if (!window.confirm("Se vuelven a traer todas las ventas del último año desde Mercado Libre. Puede tardar unos minutos. ¿Continuar?")) return;
            correr(nuevo(365));
          }}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          Traer último año
        </button>
      </div>
      {avance && (
        <p className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
          {avance} <span className="text-zinc-400">— deja esta pestaña abierta; si la cierras, puedes continuar después.</span>
        </p>
      )}
      {mensaje && <p className={`text-xs ${mensaje.startsWith("Error") ? "text-red-600" : "text-emerald-700"}`}>{mensaje}</p>}
    </div>
  );
}

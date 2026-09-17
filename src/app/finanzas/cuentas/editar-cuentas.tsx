"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CuentaFinanciera } from "@/lib/tipos";
import { eliminarCuenta } from "../actions";
import { FormularioCuenta } from "./formulario-cuenta";

/** Modo "Editar cuentas": escondido detrás de un botón chiquito, porque a
 * Isaac lo que le interesa en Cuentas es VER sus cuentas. Quitar una pide
 * escribir su nombre exacto — tienen historial importante. */
export function EditarCuentas({ cuentas }: { cuentas: CuentaFinanciera[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!abierto) {
    return (
      <div className="flex justify-end">
        <button type="button" onClick={() => setAbierto(true)} className="text-xs text-zinc-400 hover:text-zinc-700">
          Editar cuentas
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">Editar cuentas</h2>
        <button type="button" onClick={() => setAbierto(false)} className="text-xs text-zinc-400 hover:text-zinc-700">
          Cerrar
        </button>
      </div>

      <div>
        <p className="text-xs font-medium text-zinc-500">Nueva cuenta</p>
        <p className="text-xs text-zinc-400">Caja, bancos, Mercado Pago… el saldo se calcula solo, nunca se escribe a mano.</p>
        <FormularioCuenta />
      </div>

      <div>
        <p className="text-xs font-medium text-zinc-500">Quitar una cuenta</p>
        <p className="text-xs text-zinc-400">
          Se esconde de las listas, pero sus movimientos se quedan en el libro y siguen contando. Para quitarla hay que escribir su nombre exacto.
        </p>
        <ul className="mt-2 divide-y divide-zinc-100">
          {cuentas.map((c) => (
            <li key={c.id} className="py-2 text-sm">
              {quitando === c.id ? (
                <form
                  action={async (formData) => {
                    setError(null);
                    const r = await eliminarCuenta(c.id, formData);
                    if (r?.error) setError(r.error);
                    else {
                      setQuitando(null);
                      setConfirmacion("");
                      router.refresh();
                    }
                  }}
                  className="flex flex-wrap items-center gap-2"
                >
                  <span className="text-zinc-700">Escribe “{c.nombre}” para confirmar:</span>
                  <input
                    type="text"
                    name="confirmacion"
                    value={confirmacion}
                    onChange={(e) => setConfirmacion(e.target.value)}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={confirmacion.trim().toLowerCase() !== c.nombre.trim().toLowerCase()}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-40"
                  >
                    Quitar definitivamente
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuitando(null);
                      setConfirmacion("");
                      setError(null);
                    }}
                    className="text-xs text-zinc-400 hover:text-zinc-700"
                  >
                    Cancelar
                  </button>
                  {error && <p className="w-full text-xs text-red-600">{error}</p>}
                </form>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-zinc-700">{c.nombre}</span>
                  <button type="button" onClick={() => setQuitando(c.id)} className="text-xs text-zinc-400 hover:text-red-600">
                    quitar…
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

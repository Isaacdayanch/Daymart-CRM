"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AccesoCatalogo } from "@/lib/tipos";
import { formatoFecha } from "@/lib/formato";
import { cortarAccesoCatalogo, crearAccesoCatalogo, eliminarAccesoCatalogo, reactivarAccesoCatalogo } from "./actions";

const claseCampo = "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

function BotonCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        } catch {
          window.prompt("Copia el link:", texto);
        }
      }}
      className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
    >
      {copiado ? "¡Copiado!" : "Copiar link"}
    </button>
  );
}

/** Sección "Catálogo para vendedores": links secretos por vendedor (sin
 * login) que muestran el catálogo con fotos, datos y piezas en bodega, sin
 * precios. Solo dueño. */
export function AccesosVendedores({ accesos, baseUrl, faltaSql }: { accesos: AccesoCatalogo[]; baseUrl: string; faltaSql: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const activos = accesos.filter((a) => !a.revocado_en);
  const cortados = accesos.filter((a) => a.revocado_en);

  async function correr(fn: () => Promise<{ error: string | null }>) {
    setError(null);
    const r = await fn();
    if (r.error) setError(r.error);
    else router.refresh();
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Links para vendedores externos</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Un link por vendedor. Quien lo abra ve el catálogo con foto, descripción, empaque y piezas disponibles en bodega — <strong>sin precios ni costos</strong>, sin
          necesidad de cuenta. Puedes cortar un link sin afectar a los demás.
        </p>
      </div>

      {faltaSql && <p className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-xs text-amber-800">Falta correr el SQL 0043 en Supabase para poder crear links.</p>}

      <ul className="divide-y divide-zinc-100">
        {activos.map((a) => {
          const link = `${baseUrl}/catalogo/${a.token}`;
          return (
            <li key={a.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-900">{a.nombre}</p>
                <p className="truncate font-mono text-[11px] text-zinc-400">{link}</p>
                <p className="text-[11px] text-zinc-500">
                  Creado {formatoFecha(a.creado_en)}
                  {a.ultimo_acceso_en ? ` · lo abrió por última vez ${formatoFecha(a.ultimo_acceso_en)} (${a.visitas} visita${a.visitas === 1 ? "" : "s"})` : " · todavía no lo ha abierto"}
                  {a.notas && ` · ${a.notas}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <a href={link} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-zinc-900 hover:underline">
                  ver
                </a>
                <BotonCopiar texto={link} />
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`¿Cortar el acceso de "${a.nombre}"? Su link dejará de funcionar al instante.`)) void correr(() => cortarAccesoCatalogo(a.id));
                  }}
                  className="text-zinc-400 hover:text-red-600"
                >
                  cortar acceso
                </button>
              </div>
            </li>
          );
        })}
        {activos.length === 0 && !faltaSql && <li className="px-5 py-6 text-center text-sm text-zinc-400">Todavía no has creado ningún link.</li>}
      </ul>

      <div className="border-t border-zinc-100 p-5">
        {creando ? (
          <form
            action={async (fd) => {
              await correr(() => crearAccesoCatalogo(fd));
              setCreando(false);
            }}
            className="grid gap-3 sm:grid-cols-3"
          >
            <div>
              <label className="block text-xs font-medium text-zinc-500">Nombre del vendedor</label>
              <input name="nombre" required autoFocus placeholder="Ej. Juan — vendedor ML" className={claseCampo} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Notas (opcional)</label>
              <input name="notas" placeholder="Ej. teléfono, de dónde lo conoces" className={claseCampo} />
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
                Crear link
              </button>
              <button type="button" onClick={() => setCreando(false)} className="text-xs text-zinc-500 hover:text-zinc-900">
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button type="button" disabled={faltaSql} onClick={() => setCreando(true)} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50">
            + Nuevo link para un vendedor
          </button>
        )}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>

      {cortados.length > 0 && (
        <details className="border-t border-zinc-100 px-5 py-3 text-xs text-zinc-500">
          <summary className="cursor-pointer">Accesos cortados ({cortados.length})</summary>
          <ul className="mt-2 space-y-1.5">
            {cortados.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-zinc-700">{a.nombre}</span>
                <span>cortado {formatoFecha(a.revocado_en!)}</span>
                <button type="button" onClick={() => void correr(() => reactivarAccesoCatalogo(a.id))} className="text-zinc-500 hover:text-zinc-900 hover:underline">
                  reactivar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`¿Quitar definitivamente el acceso de "${a.nombre}"?`)) void correr(() => eliminarAccesoCatalogo(a.id));
                  }}
                  className="text-zinc-400 hover:text-red-600"
                >
                  quitar
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

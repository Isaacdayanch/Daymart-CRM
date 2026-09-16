"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { desconectar, probarConexion } from "./actions";

interface Conexion {
  nickname: string | null;
  mlUserId: number;
  conectadoEn: string;
  expiraEn: string;
  vigente: boolean;
}

export function PanelConexion({ configurado, conexion }: { configurado: boolean; conexion: Conexion | null }) {
  const router = useRouter();
  const [probando, setProbando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Estado de la conexión</h2>
          {conexion ? (
            <>
              <p className="mt-2 flex items-center gap-2 text-sm">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span className="font-medium text-zinc-900">Conectado</span>
                <span className="text-zinc-500">
                  como <span className="font-medium text-zinc-700">{conexion.nickname ?? `usuario ${conexion.mlUserId}`}</span>
                </span>
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Conectado el {conexion.conectadoEn}. Llave vigente hasta {conexion.expiraEn}
                {conexion.vigente ? "" : " (vencida — se renueva sola en la próxima consulta)"}.
              </p>
            </>
          ) : (
            <p className="mt-2 flex items-center gap-2 text-sm">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-zinc-300" />
              <span className="text-zinc-500">Sin conectar</span>
            </p>
          )}
          {!configurado && (
            <p className="mt-2 text-xs text-amber-700">
              Faltan las claves de Mercado Libre en Vercel. Agrégalas y haz Redeploy antes de conectar.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Es un link normal (no botón de formulario) porque la ruta hace
              un redirect a Mercado Libre y de ahí regresa al callback. */}
          <a
            href="/api/mercadolibre/conectar"
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
              configurado ? "bg-[#2D3277] hover:bg-[#1f2357]" : "pointer-events-none bg-zinc-300"
            }`}
          >
            {conexion ? "Volver a conectar" : "Conectar mi cuenta de Mercado Libre"}
          </a>
          {conexion && (
            <>
              <button
                type="button"
                disabled={probando}
                onClick={async () => {
                  setProbando(true);
                  setError(null);
                  setResultado(null);
                  const r = await probarConexion();
                  setProbando(false);
                  if (r.error) setError(r.error);
                  else if (r.resultado) setResultado(`Mercado Libre responde: ${r.resultado.nickname} (${r.resultado.sitio}, id ${r.resultado.id}).`);
                  router.refresh();
                }}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {probando ? "Probando..." : "Probar conexión"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm("¿Desconectar Mercado Libre del CRM? Podrás volver a conectar cuando quieras.")) return;
                  const r = await desconectar();
                  if (r.error) setError(r.error);
                  router.refresh();
                }}
                className="text-sm text-zinc-400 hover:text-red-600"
              >
                Desconectar
              </button>
            </>
          )}
        </div>
      </div>
      {resultado && <p className="mt-3 text-sm text-emerald-700">{resultado}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}

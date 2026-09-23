"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EnvioFullLinea } from "@/lib/tipos";
import { recibirEnvioCompleto } from "./actions";

/** Recepción de un envío a Full COMPLETO: Isaac compara lo que mandó
 * contra lo que Mercado Libre recibió y cierra el envío entero de un
 * clic. Por defecto cada renglón viene "llegó todo"; si ML recibió menos,
 * corrige la cantidad y decide si lo que faltó se quedó en bodega o fue
 * merma. */
export function ConfirmarEnvio({
  envioId,
  numero,
  lineas,
  mlReporta,
}: {
  envioId: string;
  numero: number;
  lineas: EnvioFullLinea[];
  /** Piezas que ML detectó como recibidas por SKU (pista, no obliga). */
  mlReporta: Record<string, number>;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const pendientes = lineas.filter((l) => !l.resuelta);
  const [recibidas, setRecibidas] = useState<Record<string, string>>(() =>
    Object.fromEntries(pendientes.map((l) => [l.id, String(l.cantidad_enviada - l.cantidad_recibida - l.merma)])),
  );
  const [faltante, setFaltante] = useState<Record<string, "BODEGA" | "MERMA">>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!pendientes.length) return null;

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700">
        Dar por recibido el envío #{numero}
      </button>
    );
  }

  const totalPendiente = pendientes.reduce((s, l) => s + (l.cantidad_enviada - l.cantidad_recibida - l.merma), 0);
  const totalRecibido = pendientes.reduce((s, l) => s + (Number(recibidas[l.id]) || 0), 0);

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 sm:p-5">
      <p className="text-sm font-semibold text-zinc-900">Recibir el envío #{numero} completo</p>
      <p className="mt-0.5 text-xs text-zinc-600">
        Revisa contra lo que Mercado Libre te confirmó. Si todo llegó, solo dale al botón de abajo: se descuentan de tu bodega todas las piezas del envío de un jalón.
      </p>
      <ul className="mt-3 divide-y divide-emerald-100 rounded-xl border border-emerald-100 bg-white">
        {pendientes.map((l) => {
          const pendiente = l.cantidad_enviada - l.cantidad_recibida - l.merma;
          const r = Number(recibidas[l.id]) || 0;
          const falta = pendiente - r;
          const pista = mlReporta[l.sku];
          return (
            <li key={l.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                {l.imagen_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- miniatura
                  <img src={l.imagen_url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded-lg bg-zinc-100" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-900">{l.nombre}</p>
                  <p className="text-xs text-zinc-400">
                    {l.sku} · enviadas <strong className="text-zinc-700">{pendiente}</strong>
                    {pista !== undefined && <> · ML detectó <strong className={pista === pendiente ? "text-emerald-700" : "text-amber-700"}>{pista}</strong></>}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <label className="text-zinc-500">
                  llegaron{" "}
                  <input
                    type="number"
                    min={0}
                    max={pendiente}
                    value={recibidas[l.id] ?? ""}
                    onChange={(ev) => setRecibidas((prev) => ({ ...prev, [l.id]: ev.target.value }))}
                    className="w-20 rounded-lg border border-zinc-300 px-2 py-1 text-sm text-zinc-900"
                  />
                </label>
                {falta > 0 && (
                  <div className="flex overflow-hidden rounded-lg border border-zinc-300">
                    {(
                      [
                        ["BODEGA", `${falta} se quedaron en bodega`],
                        ["MERMA", "merma"],
                      ] as const
                    ).map(([v, t]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setFaltante((prev) => ({ ...prev, [l.id]: v }))}
                        className={`px-2.5 py-1 ${(faltante[l.id] ?? "BODEGA") === v ? "bg-zinc-900 text-white" : "bg-white text-zinc-600"}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={enviando}
          onClick={async () => {
            if (!confirm(`¿Dar por recibido el envío #${numero}? Saldrán de tu bodega ${totalRecibido.toLocaleString("es-MX")} piezas hacia Full.`)) return;
            setEnviando(true);
            setError(null);
            const r = await recibirEnvioCompleto(
              envioId,
              pendientes.map((l) => ({ lineaId: l.id, recibidas: Number(recibidas[l.id]) || 0, faltante: faltante[l.id] ?? "BODEGA" })),
            );
            setEnviando(false);
            if (r?.error) setError(r.error);
            else router.refresh();
          }}
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          {enviando ? "Registrando…" : `Confirmar: ${totalRecibido.toLocaleString("es-MX")} de ${totalPendiente.toLocaleString("es-MX")} piezas recibidas en Full`}
        </button>
        <button type="button" onClick={() => setAbierto(false)} className="text-xs text-zinc-500 hover:text-zinc-900">
          Cancelar
        </button>
        {error && <p className="w-full text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}

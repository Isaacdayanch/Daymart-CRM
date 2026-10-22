"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Selector } from "@/components/selector";
import { CampoFecha } from "@/components/campo-fecha";
import { BotonGuardar } from "@/components/boton-guardar";
import type { Bodega, OrdenCompraLinea } from "@/lib/tipos";
import { cerrarOrden, recibirOrden } from "../actions";

/** "Llegó la mercancía": Isaac pone cuánto llegó de cada producto (por
 * defecto todo lo que falta), la fecha y la bodega. Un clic genera las
 * entradas de stock con el costo de la orden. Puede ser en partes. */
export function Recepcion({ ordenId, lineas, bodegas, bodegaId, parcial }: { ordenId: string; lineas: OrdenCompraLinea[]; bodegas: Bodega[]; bodegaId: string | null; parcial: boolean }) {
  const router = useRouter();
  const hoyTexto = new Date().toISOString().slice(0, 10);
  const pendientes = lineas.filter((l) => l.cantidad_recibida < l.cantidad);
  const [cantidades, setCantidades] = useState<Record<string, string>>(() => Object.fromEntries(pendientes.map((l) => [l.id, String(l.cantidad - l.cantidad_recibida)])));
  const [fecha, setFecha] = useState(hoyTexto);
  const [bodega, setBodega] = useState(bodegaId ?? bodegas[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const num = (n: number) => n.toLocaleString("es-MX");
  const totalAhora = pendientes.reduce((s, l) => s + (Number(cantidades[l.id]) || 0), 0);
  const todoLoQueFalta = pendientes.every((l) => Number(cantidades[l.id]) >= l.cantidad - l.cantidad_recibida);

  return (
    <div id="recibir" className="rounded-2xl border border-sky-200 bg-white shadow-sm">
      <div className="border-b border-sky-100 bg-sky-50/60 px-6 py-4">
        <h3 className="text-sm font-semibold text-sky-900">{parcial ? "Llegó más mercancía" : "¿Ya llegó la mercancía?"}</h3>
        <p className="text-xs text-sky-800">Pon cuánto llegó de cada producto y regístralo: entra al stock con el costo de esta orden. Si llega en partes, repites esto cada vez.</p>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setGuardando(true);
          setError(null);
          const fd = new FormData();
          fd.set("fecha", fecha);
          fd.set("bodega_id", bodega);
          fd.set("recibidas", JSON.stringify(pendientes.map((l) => ({ lineaId: l.id, cantidad: Number(cantidades[l.id]) || 0 }))));
          const r = await recibirOrden(ordenId, fd);
          setGuardando(false);
          if (r.error) {
            setError(r.error);
            return;
          }
          router.refresh();
        }}
        className="p-6"
      >
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
          {pendientes.map((l) => {
            const faltan = l.cantidad - l.cantidad_recibida;
            return (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {l.imagen_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura chica
                    <img src={l.imagen_url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="h-10 w-10 shrink-0 rounded-lg bg-zinc-100" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">{l.nombre}</p>
                    <p className="text-xs text-zinc-400">
                      faltan {num(faltan)} de {num(l.cantidad)}
                      {l.cantidad_recibida > 0 ? ` · ya llegaron ${num(l.cantidad_recibida)}` : ""}
                    </p>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-zinc-600">
                  llegaron
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={cantidades[l.id] ?? ""}
                    onChange={(e) => setCantidades((prev) => ({ ...prev, [l.id]: e.target.value }))}
                    className="w-24 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-right text-sm tabular-nums focus:border-zinc-500 focus:ring-zinc-500"
                  />
                  <span className="text-zinc-400">pzas</span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Fecha en que llegó</label>
            <div className="mt-1">
              <CampoFecha defaultValue={fecha} onChange={setFecha} max={hoyTexto} />
            </div>
          </div>
          {bodegas.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-zinc-500">A qué bodega entra</label>
              <div className="mt-1">
                <Selector defaultValue={bodega} onChange={setBodega} opciones={bodegas.map((b) => ({ value: b.id, label: b.nombre }))} />
              </div>
            </div>
          )}
          <div className="flex items-end justify-end sm:col-start-3">
            <BotonGuardar cargando={guardando} disabled={totalAhora <= 0} textoCargando="Registrando…" className="rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-sky-800">
              {todoLoQueFalta ? "Llegó todo: registrar entrada" : `Registrar ${num(totalAhora)} pzas que llegaron`}
            </BotonGuardar>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {parcial && (
          <p className="mt-4 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
            ¿Lo que falta ya no va a llegar?{" "}
            <button
              type="button"
              disabled={cerrando}
              onClick={async () => {
                if (!window.confirm("Se cierra la orden con lo que ya llegó y la cuenta por pagar se queda en eso. ¿Seguro?")) return;
                setCerrando(true);
                const r = await cerrarOrden(ordenId);
                setCerrando(false);
                if (r.error) setError(r.error);
                else router.refresh();
              }}
              className="font-medium text-zinc-700 underline-offset-2 hover:underline"
            >
              Cerrar la orden con lo recibido
            </button>
          </p>
        )}
      </form>
    </div>
  );
}

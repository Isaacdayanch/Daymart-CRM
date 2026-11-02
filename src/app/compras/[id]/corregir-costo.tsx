"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoMonto } from "@/components/campo-monto";
import { BotonGuardar } from "@/components/boton-guardar";
import { costoUnitarioConFlete, totalOrden } from "@/lib/calculos-compras";
import { formatoPesos } from "@/lib/formato";
import type { OrdenCompraLinea } from "@/lib/tipos";
import { corregirCostosOrden } from "../actions";

/** "Corregir costo" (2 nov; Isaac: "¿cómo edito el costo de productos de
 * compras?"): cambia el precio por pieza y/o el flete aunque la orden ya
 * haya recibido mercancía. Muestra en vivo el costo al stock que va a quedar
 * y, al guardar, corrige orden + stock + cuenta por pagar de un jalón. */
export function CorregirCosto({ ordenId, lineas, flete, pagado }: { ordenId: string; lineas: OrdenCompraLinea[]; flete: number; pagado: number }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [precios, setPrecios] = useState<Record<string, string>>(() => Object.fromEntries(lineas.map((l) => [l.id, String(l.precio_unitario)])));
  const [fleteTexto, setFleteTexto] = useState(String(flete || 0));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hechos, setHechos] = useState<string[] | null>(null);

  const lineasNuevas = lineas.map((l) => ({ ...l, precio_unitario: Number(precios[l.id]) || 0 }));
  const fleteNuevo = Number(fleteTexto) || 0;
  const recibidas = lineas.reduce((s, l) => s + l.cantidad_recibida, 0);
  const totalNuevo = totalOrden({ flete: fleteNuevo }, lineasNuevas);
  const hayCambio = fleteNuevo !== (flete || 0) || lineas.some((l) => Math.abs((Number(precios[l.id]) || 0) - l.precio_unitario) > 0.004);

  async function guardar() {
    setGuardando(true);
    setError(null);
    const fd = new FormData();
    fd.set("flete", fleteTexto);
    for (const l of lineas) fd.set(`precio_${l.id}`, precios[l.id] ?? "");
    const r = await corregirCostosOrden(ordenId, fd);
    setGuardando(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setHechos(r.hechos ?? []);
    setAbierto(false);
    router.refresh();
  }

  if (!abierto) {
    return (
      <div className="flex flex-col items-end gap-1">
        {hechos && (
          <div className="mb-1 w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 sm:w-auto">
            <p className="font-medium">Costo corregido.</p>
            <ul className="mt-1 list-disc pl-4">
              {hechos.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </div>
        )}
        <button type="button" onClick={() => setAbierto(true)} className="text-sm text-zinc-500 hover:text-zinc-900">
          Corregir costo
        </button>
      </div>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-zinc-900">Corregir el costo de esta orden</p>
      <p className="mt-1 text-xs text-zinc-500">
        Precio por pieza con IVA incluido, como te lo da el proveedor. Al guardar se corrige el precio en la orden
        {recibidas > 0 ? `, el costo de las ${recibidas.toLocaleString("es-MX")} piezas que ya entraron a Stock (el costo promedio se recalcula solo)` : ""} y el monto de la cuenta por
        pagar en Finanzas{pagado > 0 ? ` (los ${formatoPesos(pagado)} que ya pagaste se respetan: solo cambia el saldo)` : ""}.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-xs text-zinc-400">
              <th className="py-2 pr-3 font-medium">Producto</th>
              <th className="py-2 pr-3 text-right font-medium">Precio actual</th>
              <th className="py-2 pr-3 font-medium">Precio nuevo</th>
              <th className="py-2 text-right font-medium">Costo al stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {lineasNuevas.map((l, i) => {
              const original = lineas[i];
              const costo = costoUnitarioConFlete(l, lineasNuevas, fleteNuevo);
              const cambio = Math.abs(l.precio_unitario - original.precio_unitario) > 0.004;
              return (
                <tr key={l.id}>
                  <td className="py-2 pr-3">
                    <p className="font-medium text-zinc-900">{l.nombre}</p>
                    <p className="font-mono text-[11px] text-zinc-400">
                      {l.sku} · {l.cantidad_recibida.toLocaleString("es-MX")} de {l.cantidad.toLocaleString("es-MX")} recibidas
                    </p>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-zinc-500">{formatoPesos(original.precio_unitario)}</td>
                  <td className="py-2 pr-3">
                    <CampoMonto
                      value={precios[l.id] ?? ""}
                      onChange={(v) => setPrecios((p) => ({ ...p, [l.id]: v }))}
                      className={`block w-32 rounded-lg border px-3 py-1.5 text-sm focus:border-zinc-500 focus:ring-zinc-500 ${cambio ? "border-amber-400 bg-amber-50" : "border-zinc-300"}`}
                    />
                  </td>
                  <td className={`py-2 text-right tabular-nums ${cambio || fleteNuevo !== (flete || 0) ? "font-medium text-amber-800" : "text-zinc-500"}`}>
                    {formatoPesos(costo)}
                    {fleteNuevo > 0 && <span className="block text-[10px] font-normal text-zinc-400">con flete</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Flete u otros gastos (IVA incluido)</label>
          <CampoMonto value={fleteTexto} onChange={setFleteTexto} className="mt-1 block w-40 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:ring-zinc-500" />
        </div>
        <p className="text-sm text-zinc-600">
          Total de la orden: <span className="font-semibold text-zinc-900">{formatoPesos(totalNuevo)}</span>
        </p>
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            setError(null);
          }}
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          Cancelar
        </button>
        <BotonGuardar
          onClick={guardar}
          cargando={guardando}
          disabled={!hayCambio}
          textoCargando="Corrigiendo…"
          mostrarListo={false}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Guardar corrección
        </BotonGuardar>
      </div>
    </div>
  );
}

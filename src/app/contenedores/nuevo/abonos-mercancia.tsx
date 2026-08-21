"use client";

import { useState } from "react";
import { CampoNumero } from "@/components/campo-numero";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

interface Fila {
  id: number;
}

export function AbonosMercancia() {
  const [filas, setFilas] = useState<Fila[]>([{ id: 1 }]);

  return (
    <div>
      <p className="text-sm font-medium text-zinc-700">Abonos de mercancía (dólares)</p>
      <p className="text-xs text-zinc-500">
        Agrega cada abono con su propio tipo de cambio. El sistema calcula solo el tipo de cambio
        promedio para convertir el precio de los productos a pesos.
      </p>

      <div className="mt-2 space-y-2">
        {filas.map((fila) => (
          <div key={fila.id} className="grid grid-cols-[1fr_1fr_auto_auto] items-end gap-2">
            <div>
              <label className="block text-xs font-medium text-zinc-500">Monto USD</label>
              <CampoNumero name="abono_monto" className={claseCampo} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Tipo de cambio</label>
              <CampoNumero name="abono_tipo_cambio" className={claseCampo} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Estado</label>
              <select
                name="abono_pagado"
                defaultValue="true"
                className="mt-1 block rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
              >
                <option value="true">Pagado</option>
                <option value="false">Pendiente</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => setFilas((f) => f.filter((x) => x.id !== fila.id))}
              disabled={filas.length === 1}
              className="rounded-lg px-2 py-2 text-sm text-zinc-400 hover:text-red-600 disabled:opacity-0"
              aria-label="Quitar abono"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() =>
          setFilas((f) => [...f, { id: (f.length ? Math.max(...f.map((x) => x.id)) : 0) + 1 }])
        }
        className="mt-2 text-sm font-medium text-zinc-600 hover:text-zinc-900"
      >
        + Agregar otro abono
      </button>
    </div>
  );
}

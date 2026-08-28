"use client";

import { useState } from "react";
import { CampoFecha } from "@/components/campo-fecha";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import type { PagoMercancia } from "@/lib/tipos";
import { actualizarFechaAbono, eliminarAbono } from "./actions";

export function FilaAbono({ contenedorId, abono }: { contenedorId: string; abono: PagoMercancia }) {
  const [editandoFecha, setEditandoFecha] = useState(false);

  if (editandoFecha) {
    return (
      <li className="flex items-center gap-2 py-2 text-sm">
        <form
          action={async (formData) => {
            await actualizarFechaAbono(contenedorId, abono.id, formData);
            setEditandoFecha(false);
          }}
          className="flex flex-1 items-center gap-2"
        >
          <CampoFecha
            name="fecha"
            defaultValue={(abono.fecha ?? abono.creado_en).slice(0, 10)}
            max={new Date().toISOString().slice(0, 10)}
            required
          />
          <button type="submit" className="text-xs font-medium text-zinc-900 hover:underline">
            Guardar
          </button>
          <button
            type="button"
            onClick={() => setEditandoFecha(false)}
            className="text-xs font-medium text-zinc-400 hover:text-zinc-700"
          >
            Cancelar
          </button>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between py-2 text-sm">
      <span>
        ${abono.monto_dolares.toLocaleString("es-MX")} USD × {abono.tipo_cambio} ={" "}
        {formatoPesos(abono.monto_dolares * abono.tipo_cambio)}
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setEditandoFecha(true)}
          className="text-xs text-zinc-400 hover:text-zinc-900"
        >
          {formatoFecha(abono.fecha ?? abono.creado_en)}
        </button>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            abono.pagado ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {abono.pagado ? "Pagado" : "Pendiente"}
        </span>
        <button
          type="button"
          onClick={() => eliminarAbono(contenedorId, abono.id)}
          className="text-zinc-400 hover:text-red-600"
          aria-label="Quitar abono"
        >
          ✕
        </button>
      </div>
    </li>
  );
}

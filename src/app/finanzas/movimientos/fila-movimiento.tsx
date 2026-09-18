"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatoDolares, formatoFecha, formatoPesos } from "@/lib/formato";
import { CATEGORIA_AJUSTE } from "@/lib/estado-cuenta";
import type { CategoriaFinanciera, CuentaFinanciera, MovimientoFinanciero } from "@/lib/tipos";
import { eliminarMovimiento } from "../actions";
import { FormularioEditarMovimiento } from "./formulario-editar-movimiento";

const ETIQUETA_TIPO: Record<string, string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  TRANSFERENCIA: "Transferencia",
};

export function FilaMovimiento({
  movimiento: m,
  cuentas,
  categorias,
  cuentaNombre,
  cuentaDestinoNombre,
  categoriaNombre,
  bloqueado,
}: {
  movimiento: MovimientoFinanciero;
  cuentas: CuentaFinanciera[];
  categorias: CategoriaFinanciera[];
  cuentaNombre: string;
  cuentaDestinoNombre: string;
  categoriaNombre: string;
  bloqueado: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <tr className="bg-zinc-50">
        <td colSpan={7} className="p-4">
          <FormularioEditarMovimiento
            movimiento={m}
            cuentas={cuentas}
            categorias={categorias}
            esAjuste={categoriaNombre === CATEGORIA_AJUSTE}
            alTerminar={() => setEditando(false)}
          />
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="px-6 py-3 text-xs text-zinc-500">{formatoFecha(m.fecha)}</td>
      <td className="px-6 py-3">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
            m.tipo === "ENTRADA"
              ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
              : m.tipo === "SALIDA"
                ? "bg-red-50 text-red-700 ring-red-600/20"
                : "bg-zinc-100 text-zinc-600 ring-zinc-500/20"
          }`}
        >
          {ETIQUETA_TIPO[m.tipo]}
        </span>
        {m.comision_pendiente && (
          <a href="/finanzas#pendientes-china" className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20 hover:bg-amber-200">
            falta comisión
          </a>
        )}
      </td>
      <td className="px-6 py-3 text-zinc-600">
        {cuentaNombre}
        {m.tipo === "TRANSFERENCIA" && ` → ${cuentaDestinoNombre}`}
      </td>
      <td className="px-6 py-3 text-zinc-600">{categoriaNombre}</td>
      <td className="px-6 py-3 text-xs text-zinc-500">{[m.contraparte, m.notas].filter(Boolean).join(" · ") || "—"}</td>
      <td
        className={`px-6 py-3 text-right font-semibold ${
          m.tipo === "ENTRADA" ? "text-emerald-600" : m.tipo === "SALIDA" ? "text-red-600" : "text-zinc-900"
        }`}
      >
        {m.tipo === "SALIDA" ? "-" : m.tipo === "ENTRADA" ? "+" : ""}
        {m.moneda === "USD" ? formatoDolares(m.monto) : formatoPesos(m.monto)}
      </td>
      <td className="px-6 py-3 text-right text-xs whitespace-nowrap">
        {bloqueado ? (
          <span className="text-zinc-300">—</span>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setEditando(true)} className="text-zinc-400 underline hover:text-zinc-900">
              editar
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!confirm("¿Quitar este movimiento? No se puede deshacer.")) return;
                const resultado = await eliminarMovimiento(m.id);
                if (resultado?.error) alert(resultado.error);
                else router.refresh();
              }}
              className="text-red-600 underline hover:text-red-800"
            >
              quitar
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

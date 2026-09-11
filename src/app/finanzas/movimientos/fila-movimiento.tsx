"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoMonto } from "@/components/campo-monto";
import { Selector } from "@/components/selector";
import { formatoDolares, formatoFecha, formatoPesos } from "@/lib/formato";
import type { CategoriaFinanciera, CuentaFinanciera, MovimientoFinanciero } from "@/lib/tipos";
import { actualizarMovimiento, eliminarMovimiento } from "../actions";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

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
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const hoyTexto = new Date().toISOString().slice(0, 10);

  if (editando) {
    return (
      <tr className="bg-zinc-50">
        <td colSpan={7} className="p-4">
          <form
            action={async (formData) => {
              setEnviando(true);
              setError(null);
              const resultado = await actualizarMovimiento(m.id, formData);
              setEnviando(false);
              if (resultado?.error) setError(resultado.error);
              else {
                setEditando(false);
                router.refresh();
              }
            }}
            className="grid gap-3 sm:grid-cols-3"
          >
            <div>
              <label className="block text-xs font-medium text-zinc-500">Monto</label>
              <CampoMonto name="monto" defaultValue={m.monto} required className={claseCampo} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Fecha</label>
              <CampoFecha name="fecha" defaultValue={m.fecha.slice(0, 10)} max={hoyTexto} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">
                {m.tipo === "ENTRADA" ? "Cuenta destino" : "Cuenta"}
              </label>
              <div className="mt-1">
                <Selector
                  name="cuenta_id"
                  defaultValue={m.cuenta_id}
                  opciones={cuentas.map((c) => ({ value: c.id, label: c.nombre }))}
                />
              </div>
            </div>
            {m.tipo === "TRANSFERENCIA" ? (
              <div>
                <label className="block text-xs font-medium text-zinc-500">Cuenta destino</label>
                <div className="mt-1">
                  <Selector
                    name="cuenta_destino_id"
                    defaultValue={m.cuenta_destino_id ?? ""}
                    opciones={cuentas.map((c) => ({ value: c.id, label: c.nombre }))}
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-zinc-500">Categoría</label>
                <div className="mt-1">
                  <Selector
                    name="categoria_id"
                    defaultValue={m.categoria_id ?? ""}
                    opciones={[
                      { value: "", label: "Sin categoría" },
                      ...categorias.map((c) => ({ value: c.id, label: c.nombre })),
                    ]}
                  />
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-zinc-500">Contraparte</label>
              <input type="text" name="contraparte" defaultValue={m.contraparte ?? ""} className={claseCampo} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Notas</label>
              <input type="text" name="notas" defaultValue={m.notas ?? ""} className={claseCampo} />
            </div>
            {error && <p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
            <div className="flex gap-2 sm:col-span-3">
              <button
                type="submit"
                disabled={enviando}
                className="rounded-lg bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {enviando ? "Guardando..." : "Guardar"}
              </button>
              <button
                type="button"
                onClick={() => setEditando(false)}
                className="text-xs font-medium text-zinc-400 hover:text-zinc-700"
              >
                Cancelar
              </button>
            </div>
          </form>
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

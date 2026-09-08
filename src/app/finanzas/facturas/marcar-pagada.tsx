"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { Selector } from "@/components/selector";
import type { CategoriaFinanciera, CuentaFinanciera } from "@/lib/tipos";
import { marcarFacturaPagada } from "../actions";

export function MarcarPagada({
  facturaId,
  cuentas,
  categorias,
}: {
  facturaId: string;
  cuentas: CuentaFinanciera[];
  categorias: CategoriaFinanciera[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const hoyTexto = new Date().toISOString().slice(0, 10);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-sm font-medium text-emerald-600 hover:text-emerald-800"
      >
        Marcar pagada
      </button>
    );
  }

  return (
    <form
      action={async (formData) => {
        setEnviando(true);
        setError(null);
        const resultado = await marcarFacturaPagada(facturaId, formData);
        setEnviando(false);
        if (resultado?.error) {
          setError(resultado.error);
        } else {
          setAbierto(false);
          router.refresh();
        }
      }}
      className="mt-2 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3"
    >
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-zinc-500">De qué cuenta sale</label>
          <div className="mt-1">
            <Selector
              name="cuenta_id"
              defaultValue={cuentas[0]?.id}
              opciones={cuentas.map((c) => ({ value: c.id, label: c.nombre }))}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Categoría</label>
          <div className="mt-1">
            <Selector
              name="categoria_id"
              defaultValue=""
              opciones={[{ value: "", label: "Sin categoría" }, ...categorias.map((c) => ({ value: c.id, label: c.nombre }))]}
            />
          </div>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500">Fecha de pago</label>
        <CampoFecha name="fecha_pago" defaultValue={hoyTexto} max={hoyTexto} required />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="rounded-lg px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={enviando}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {enviando ? "Guardando..." : "Confirmar pago"}
        </button>
      </div>
    </form>
  );
}

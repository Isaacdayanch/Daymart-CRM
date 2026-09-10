"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoMonto } from "@/components/campo-monto";
import { Selector } from "@/components/selector";
import { formatoDolares, formatoFecha, formatoPesos } from "@/lib/formato";
import type { CuentaFinanciera, Moneda, PagoFactura } from "@/lib/tipos";
import { actualizarPagoFactura, eliminarPagoFactura } from "../actions";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export function PagoItem({ pago, moneda, cuentas }: { pago: PagoFactura; moneda: Moneda; cuentas: CuentaFinanciera[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const hoyTexto = new Date().toISOString().slice(0, 10);

  if (!editando) {
    return (
      <div className="flex items-center justify-between px-4 py-2 text-sm">
        <div>
          <p className="text-zinc-700">{formatoFecha(pago.fecha)}</p>
          {pago.notas && <p className="text-xs text-zinc-400">{pago.notas}</p>}
        </div>
        <div className="flex items-center gap-3">
          <p className="font-medium text-zinc-900">{moneda === "USD" ? formatoDolares(pago.monto) : formatoPesos(pago.monto)}</p>
          <button type="button" onClick={() => setEditando(true)} className="text-xs text-zinc-400 underline hover:text-zinc-900">
            editar
          </button>
          <form action={eliminarPagoFactura.bind(null, pago.id)}>
            <button type="submit" className="text-xs text-red-600 underline hover:text-red-800">
              quitar
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <form
      action={async (formData) => {
        setEnviando(true);
        setError(null);
        const resultado = await actualizarPagoFactura(pago.id, formData);
        setEnviando(false);
        if (resultado?.error) setError(resultado.error);
        else {
          setEditando(false);
          router.refresh();
        }
      }}
      className="grid gap-2 bg-zinc-50 px-4 py-3 sm:grid-cols-[1fr_1fr_2fr_auto_auto] sm:items-end"
    >
      <div>
        <label className="block text-xs font-medium text-zinc-500">Monto</label>
        <CampoMonto name="monto" defaultValue={pago.monto} required className={claseCampo} />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500">Fecha</label>
        <CampoFecha name="fecha" defaultValue={pago.fecha.slice(0, 10)} max={hoyTexto} required />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500">Cuenta</label>
        <div className="mt-1">
          <Selector
            name="cuenta_id"
            defaultValue={pago.cuenta_id ?? ""}
            opciones={[
              { value: "", label: "Sin cuenta (fue antes de usar el sistema)" },
              ...cuentas.map((c) => ({ value: c.id, label: c.nombre })),
            ]}
          />
        </div>
      </div>
      <button type="submit" disabled={enviando} className="h-fit rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50">
        {enviando ? "Guardando..." : "Guardar"}
      </button>
      <button type="button" onClick={() => setEditando(false)} className="h-fit text-xs font-medium text-zinc-400 hover:text-zinc-700">
        Cancelar
      </button>
      {error && <p className="text-sm text-red-600 sm:col-span-5">{error}</p>}
    </form>
  );
}

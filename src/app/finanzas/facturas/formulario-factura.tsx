"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoMonto } from "@/components/campo-monto";
import { Selector } from "@/components/selector";
import { agregarFactura } from "../actions";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export function FormularioFactura() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [version, setVersion] = useState(0);
  const hoyTexto = new Date().toISOString().slice(0, 10);

  return (
    <form
      key={version}
      action={async (formData) => {
        setEnviando(true);
        setError(null);
        const resultado = await agregarFactura(formData);
        setEnviando(false);
        if (resultado?.error) {
          setError(resultado.error);
        } else {
          setVersion((v) => v + 1);
          router.refresh();
        }
      }}
      className="mt-4 space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Folio</label>
          <input type="text" name="folio" placeholder="Ej. 123" className={claseCampo} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Proveedor</label>
          <input type="text" name="proveedor" required className={claseCampo} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500">Concepto</label>
        <input type="text" name="concepto" placeholder="Opcional" className={claseCampo} />
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Monto (con IVA incluido)</label>
          <CampoMonto name="monto" required className={claseCampo} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Moneda</label>
          <div className="mt-1">
            <Selector
              name="moneda"
              defaultValue="MXN"
              opciones={[
                { value: "MXN", label: "Pesos (MXN)" },
                { value: "USD", label: "Dólares (USD)" },
              ]}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Fecha de la factura</label>
          <CampoFecha name="fecha_emision" defaultValue={hoyTexto} max={hoyTexto} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Fecha límite (opcional)</label>
          <CampoFecha name="fecha_limite" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500">Notas</label>
        <input type="text" name="notas" placeholder="Opcional" className={claseCampo} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={enviando}
          className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 disabled:opacity-50"
        >
          {enviando ? "Guardando..." : "Agregar"}
        </button>
      </div>
    </form>
  );
}

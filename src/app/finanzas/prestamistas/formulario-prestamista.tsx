"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoMonto } from "@/components/campo-monto";
import { Selector } from "@/components/selector";
import type { CuentaFinanciera, Prestamista, TipoMovimientoPrestamista } from "@/lib/tipos";
import { registrarMovimientoPrestamista } from "../actions";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export function FormularioPrestamista({
  prestamistas,
  cuentas,
}: {
  prestamistas: Prestamista[];
  cuentas: CuentaFinanciera[];
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoMovimientoPrestamista>("PRESTAMO");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const hoyTexto = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">Registrar préstamo o pago</h2>
      <div className="mt-3 flex gap-1.5 rounded-xl bg-zinc-100 p-1">
        {(["PRESTAMO", "PAGO"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTipo(t)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
              tipo === t ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {t === "PRESTAMO" ? "Préstamo recibido" : "Pago que le hago"}
          </button>
        ))}
      </div>
      <form
        key={tipo}
        action={async (formData) => {
          setEnviando(true);
          setError(null);
          formData.set("tipo", tipo);
          const resultado = await registrarMovimientoPrestamista(formData);
          setEnviando(false);
          if (resultado?.error) setError(resultado.error);
          else router.refresh();
        }}
        className="mt-4 grid gap-3 sm:grid-cols-2"
      >
        <div>
          <label className="block text-xs font-medium text-zinc-500">Prestamista</label>
          <div className="mt-1">
            <Selector
              name="prestamista_id"
              defaultValue={prestamistas[0]?.id}
              opciones={prestamistas.map((p) => ({ value: p.id, label: p.nombre }))}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">
            {tipo === "PRESTAMO" ? "Cuenta destino" : "Cuenta de origen"}
          </label>
          <div className="mt-1">
            <Selector
              name="cuenta_id"
              defaultValue={cuentas[0]?.id}
              opciones={cuentas.map((c) => ({ value: c.id, label: c.nombre }))}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Monto</label>
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
          <label className="block text-xs font-medium text-zinc-500">Fecha</label>
          <CampoFecha name="fecha" defaultValue={hoyTexto} max={hoyTexto} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Notas</label>
          <input type="text" name="notas" placeholder="Opcional" className={claseCampo} />
        </div>
        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        <div className="flex justify-end sm:col-span-2">
          <button
            type="submit"
            disabled={enviando || prestamistas.length === 0}
            className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 disabled:opacity-50"
          >
            {enviando ? "Guardando..." : "Registrar"}
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { Selector } from "@/components/selector";
import { formatoDolares, formatoPesos } from "@/lib/formato";
import type { CategoriaFinanciera, CuentaFinanciera } from "@/lib/tipos";
import { registrarPagoFactura } from "../actions";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

interface FacturaOpcion {
  id: string;
  folio: string | null;
  proveedor: string;
  moneda: "MXN" | "USD";
  saldo: number;
}

export function RegistrarPago({
  facturas,
  cuentas,
  categorias,
}: {
  facturas: FacturaOpcion[];
  cuentas: CuentaFinanciera[];
  categorias: CategoriaFinanciera[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [version, setVersion] = useState(0);
  const hoyTexto = new Date().toISOString().slice(0, 10);

  if (facturas.length === 0) return null;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">Registrar pago de factura</h2>
      <form
        key={version}
        action={async (formData) => {
          setEnviando(true);
          setError(null);
          const resultado = await registrarPagoFactura(formData);
          setEnviando(false);
          if (resultado?.error) setError(resultado.error);
          else {
            setVersion((v) => v + 1);
            router.refresh();
          }
        }}
        className="mt-4 grid gap-3 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-zinc-500">Factura</label>
          <div className="mt-1">
            <Selector
              name="factura_id"
              defaultValue={facturas[0]?.id}
              opciones={facturas.map((f) => ({
                value: f.id,
                label: `${f.folio ? `Folio ${f.folio} — ` : ""}${f.proveedor} — saldo: ${
                  f.moneda === "USD" ? formatoDolares(f.saldo) : formatoPesos(f.saldo)
                }`,
              }))}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Monto que pagas</label>
          <input type="number" name="monto" min={0.01} step="0.01" required className={claseCampo} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Cuenta de origen</label>
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
        <div>
          <label className="block text-xs font-medium text-zinc-500">Fecha</label>
          <CampoFecha name="fecha" defaultValue={hoyTexto} max={hoyTexto} required />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-zinc-500">Notas</label>
          <input type="text" name="notas" placeholder="Opcional" className={claseCampo} />
        </div>
        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        <div className="flex justify-end sm:col-span-2">
          <button
            type="submit"
            disabled={enviando}
            className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 disabled:opacity-50"
          >
            {enviando ? "Guardando..." : "Registrar pago"}
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoMonto } from "@/components/campo-monto";
import { CampoSugerencias } from "@/components/campo-sugerencias";
import { Selector } from "@/components/selector";
import type { CuentaFinanciera, Moneda } from "@/lib/tipos";
import { registrarEnvioCuentaPuente } from "../actions";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

interface ContenedorOpcion {
  id: string;
  numero: number;
}

export function EnvioPuente({
  cuentas,
  proveedores,
  contenedores,
}: {
  cuentas: CuentaFinanciera[];
  proveedores: string[];
  contenedores: ContenedorOpcion[];
}) {
  const router = useRouter();
  const [proveedor, setProveedor] = useState("");
  const [monedaProveedor, setMonedaProveedor] = useState<Moneda>("USD");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [version, setVersion] = useState(0);
  const hoyTexto = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">Enviar desde una cuenta puente</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Para cuando alguien (ej. tu encargado financiero) te maneja el envío a China — cada envío trae su
        propio tipo de cambio y comisión, y aquí se le pueden ligar a un contenedor para que ese costo se sume
        directo a la mercancía.
      </p>
      <form
        key={version}
        action={async (formData) => {
          setEnviando(true);
          setError(null);
          formData.set("moneda_proveedor", monedaProveedor);
          const resultado = await registrarEnvioCuentaPuente(formData);
          setEnviando(false);
          if (resultado?.error) setError(resultado.error);
          else {
            setProveedor("");
            setVersion((v) => v + 1);
            router.refresh();
          }
        }}
        className="mt-4 grid gap-3 sm:grid-cols-2"
      >
        <div>
          <label className="block text-xs font-medium text-zinc-500">Cuenta puente (de dónde sale)</label>
          <div className="mt-1">
            <Selector
              name="cuenta_id"
              defaultValue={cuentas[0]?.id}
              opciones={cuentas.map((c) => ({ value: c.id, label: c.nombre }))}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Proveedor destino</label>
          <CampoSugerencias name="proveedor" value={proveedor} onChange={setProveedor} sugerencias={proveedores} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Pesos que salen (sin comisión)</label>
          <CampoMonto name="monto_pesos" required className={claseCampo} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Comisión de esta transacción (pesos)</label>
          <CampoMonto name="comision_pesos" defaultValue={0} className={claseCampo} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Moneda de la deuda de ese proveedor</label>
          <div className="mt-1">
            <Selector
              onChange={(v) => setMonedaProveedor(v as Moneda)}
              defaultValue="USD"
              opciones={[
                { value: "USD", label: "Dólares (USD)" },
                { value: "MXN", label: "Pesos (MXN)" },
              ]}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">
            Monto a abonarle a su deuda (en {monedaProveedor === "USD" ? "dólares" : "pesos"})
          </label>
          <CampoMonto name="monto_abono" required className={claseCampo} />
        </div>
        {monedaProveedor === "USD" && (
          <div>
            <label className="block text-xs font-medium text-zinc-500">Dólares que le llegaron (si va a un contenedor)</label>
            <CampoMonto name="monto_dolares" className={claseCampo} />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-zinc-500">Contenedor (opcional)</label>
          <div className="mt-1">
            <Selector
              name="contenedor_id"
              defaultValue=""
              opciones={[
                { value: "", label: "Sin contenedor todavía" },
                ...contenedores.map((c) => ({ value: c.id, label: `Contenedor ${c.numero}` })),
              ]}
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
            {enviando ? "Guardando..." : "Registrar envío"}
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoSugerencias } from "@/components/campo-sugerencias";
import { Selector } from "@/components/selector";
import type { CuentaFinanciera } from "@/lib/tipos";
import { agregarCargoProveedor, registrarAbonoProveedor } from "../actions";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export function FormularioProveedor({ proveedores, cuentas }: { proveedores: string[]; cuentas: CuentaFinanciera[] }) {
  const router = useRouter();
  const [modo, setModo] = useState<"CARGO" | "ABONO">("ABONO");
  const [proveedor, setProveedor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const hoyTexto = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">Nuevo cargo o abono</h2>
      <div className="mt-3 flex gap-1.5 rounded-xl bg-zinc-100 p-1">
        {(["ABONO", "CARGO"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
              modo === m ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {m === "ABONO" ? "Pagar a cuenta" : "Nuevo pedido / cargo"}
          </button>
        ))}
      </div>

      <form
        key={modo}
        action={async (formData) => {
          setEnviando(true);
          setError(null);
          if (modo === "CARGO") {
            await agregarCargoProveedor(formData);
            setEnviando(false);
            setProveedor("");
            router.refresh();
            return;
          }
          const resultado = await registrarAbonoProveedor(formData);
          setEnviando(false);
          if (resultado?.error) setError(resultado.error);
          else {
            setProveedor("");
            router.refresh();
          }
        }}
        className="mt-4 grid gap-3 sm:grid-cols-2"
      >
        <div>
          <label className="block text-xs font-medium text-zinc-500">Proveedor</label>
          <CampoSugerencias
            name="proveedor"
            value={proveedor}
            onChange={setProveedor}
            sugerencias={proveedores}
            required
          />
        </div>
        {modo === "ABONO" && (
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
        )}
        <div>
          <label className="block text-xs font-medium text-zinc-500">Monto</label>
          <input type="number" name="monto" min={0.01} step="0.01" required className={claseCampo} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Moneda</label>
          <div className="mt-1">
            <Selector
              name="moneda"
              defaultValue="USD"
              opciones={[
                { value: "USD", label: "Dólares (USD)" },
                { value: "MXN", label: "Pesos (MXN)" },
              ]}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Fecha</label>
          <CampoFecha name="fecha" defaultValue={hoyTexto} max={hoyTexto} required />
        </div>
        {modo === "CARGO" && (
          <div>
            <label className="block text-xs font-medium text-zinc-500">Fecha límite de pago (opcional)</label>
            <CampoFecha name="fecha_limite" />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-zinc-500">Notas</label>
          <input type="text" name="notas" placeholder="Ej. pedido / contenedor" className={claseCampo} />
        </div>
        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        <div className="flex justify-end sm:col-span-2">
          <button
            type="submit"
            disabled={enviando}
            className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 disabled:opacity-50"
          >
            {enviando ? "Guardando..." : modo === "ABONO" ? "Registrar pago" : "Agregar cargo"}
          </button>
        </div>
      </form>
    </div>
  );
}

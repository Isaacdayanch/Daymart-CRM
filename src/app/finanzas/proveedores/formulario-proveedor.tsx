"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoMonto } from "@/components/campo-monto";
import { CampoSugerencias } from "@/components/campo-sugerencias";
import { Selector } from "@/components/selector";
import type { CuentaFinanciera } from "@/lib/tipos";
import { formatoFecha } from "@/lib/formato";
import { claveProveedor, textoUltimoPago, type UltimosPagos } from "@/lib/ultimos-pagos";
import { agregarCargoProveedor, registrarAbonoProveedor } from "../actions";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export function FormularioProveedor({ proveedores, cuentas, ultimos = {} }: { proveedores: string[]; cuentas: CuentaFinanciera[]; ultimos?: UltimosPagos }) {
  const router = useRouter();
  const [modo, setModo] = useState<"CARGO" | "ABONO">("ABONO");
  const [proveedor, setProveedor] = useState("");
  // Propuesta "como la última vez": al escribir/elegir un proveedor que ya
  // tiene pagos, la cuenta y la moneda se precargan con las de su último
  // pago (Isaac, 6 oct). Los Selector son sin controlar: el `key` los
  // vuelve a montar con el nuevo defaultValue.
  const sugerido = ultimos[claveProveedor(proveedor)];
  const nombreCuenta = (id: string | null) => cuentas.find((c) => c.id === id)?.nombre ?? null;
  const cuentaPropuesta = sugerido ? (sugerido.cuentaId ?? "") : (cuentas[0]?.id ?? "");
  const monedaPropuesta = sugerido?.moneda ?? "USD";
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
            const resultadoCargo = await agregarCargoProveedor(formData);
            setEnviando(false);
            if (resultadoCargo?.error) {
              setError(resultadoCargo.error);
            } else {
              setProveedor("");
              router.refresh();
            }
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
          {sugerido && modo === "ABONO" && <p className="mt-1 text-xs text-emerald-700">{textoUltimoPago(sugerido, nombreCuenta, formatoFecha)}</p>}
        </div>
        {modo === "ABONO" && (
          <div>
            <label className="block text-xs font-medium text-zinc-500">Cuenta de origen</label>
            <div className="mt-1">
              <Selector
                key={`cuenta-${cuentaPropuesta}`}
                name="cuenta_id"
                defaultValue={cuentaPropuesta}
                opciones={[
                  ...cuentas.map((c) => ({ value: c.id, label: c.nombre })),
                  { value: "", label: "Sin cuenta (fue antes de usar el sistema)" },
                ]}
              />
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              &ldquo;Sin cuenta&rdquo; solo baja la deuda del proveedor; no resta de ninguna cuenta de Finanzas.
            </p>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-zinc-500">Monto</label>
          <CampoMonto name="monto" required className={claseCampo} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Moneda</label>
          <div className="mt-1">
            <Selector
              key={`moneda-${monedaPropuesta}`}
              name="moneda"
              defaultValue={monedaPropuesta}
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

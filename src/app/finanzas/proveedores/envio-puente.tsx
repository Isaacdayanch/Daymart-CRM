"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoMonto } from "@/components/campo-monto";
import { CampoSugerencias } from "@/components/campo-sugerencias";
import { Selector } from "@/components/selector";
import { formatoFecha } from "@/lib/formato";
import type { CuentaFinanciera, Moneda } from "@/lib/tipos";
import { registrarEnvioCuentaPuente } from "../actions";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

interface ContenedorOpcion {
  id: string;
  numero: number;
  proveedor: string | null;
}

export interface AbonoPendienteOpcion {
  id: string;
  contenedor_id: string;
  monto_dolares: number;
  fecha_limite: string | null;
}

export function EnvioPuente({
  cuentas,
  proveedores,
  contenedores,
  abonosPendientes,
}: {
  cuentas: CuentaFinanciera[];
  proveedores: string[];
  contenedores: ContenedorOpcion[];
  /** Abonos "Pendiente" (crédito del proveedor) por contenedor — al elegir
   * uno, el pago se le aplica en vez de crear un abono nuevo. */
  abonosPendientes: AbonoPendienteOpcion[];
}) {
  const router = useRouter();
  const [proveedor, setProveedor] = useState("");
  const [monedaProveedor, setMonedaProveedor] = useState<Moneda>("USD");
  const [contenedorId, setContenedorId] = useState("");
  const [abonoPendienteId, setAbonoPendienteId] = useState("");
  const [montoDolares, setMontoDolares] = useState("");
  const [montoAbono, setMontoAbono] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [version, setVersion] = useState(0);
  const hoyTexto = new Date().toISOString().slice(0, 10);

  const pendientesDelContenedor = abonosPendientes.filter((a) => a.contenedor_id === contenedorId);

  function alElegirContenedor(id: string) {
    setContenedorId(id);
    setAbonoPendienteId("");
    const contenedor = contenedores.find((c) => c.id === id);
    if (contenedor?.proveedor && !proveedor) setProveedor(contenedor.proveedor);
  }

  function alElegirAbono(id: string) {
    setAbonoPendienteId(id);
    const abono = abonosPendientes.find((a) => a.id === id);
    if (abono) {
      setMontoDolares(String(abono.monto_dolares));
      if (monedaProveedor === "USD") setMontoAbono(String(abono.monto_dolares));
    }
  }

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
          formData.set("contenedor_id", contenedorId);
          formData.set("abono_pendiente_id", abonoPendienteId);
          const resultado = await registrarEnvioCuentaPuente(formData);
          setEnviando(false);
          if (resultado?.error) setError(resultado.error);
          else {
            setProveedor("");
            setContenedorId("");
            setAbonoPendienteId("");
            setMontoDolares("");
            setMontoAbono("");
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
          <label className="block text-xs font-medium text-zinc-500">Contenedor (opcional)</label>
          <div className="mt-1">
            <Selector
              defaultValue=""
              onChange={alElegirContenedor}
              opciones={[
                { value: "", label: "Sin contenedor todavía" },
                ...contenedores.map((c) => ({ value: c.id, label: `Contenedor ${c.numero}` })),
              ]}
            />
          </div>
        </div>
        {pendientesDelContenedor.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 sm:col-span-2">
            <label className="block text-xs font-medium text-amber-900">
              Este contenedor tiene crédito pendiente — ¿a qué abono aplica este pago?
            </label>
            <div className="mt-1">
              <Selector
                key={contenedorId}
                defaultValue=""
                onChange={alElegirAbono}
                opciones={[
                  { value: "", label: "Es un abono nuevo (no aplica a los pendientes)" },
                  ...pendientesDelContenedor.map((a) => ({
                    value: a.id,
                    label: `Pendiente de $${a.monto_dolares.toLocaleString("es-MX")} USD${
                      a.fecha_limite ? ` — vence ${formatoFecha(a.fecha_limite)}` : ""
                    }`,
                  })),
                ]}
              />
            </div>
            <p className="mt-1 text-[11px] text-amber-800">
              Al aplicarlo, ese abono pasa a Pagado con el tipo de cambio real de esta transacción y el costo por
              pieza se recalcula solo.
            </p>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-zinc-500">Proveedor destino</label>
          <CampoSugerencias name="proveedor" value={proveedor} onChange={setProveedor} sugerencias={proveedores} required />
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
          <label className="block text-xs font-medium text-zinc-500">Pesos que salen (sin comisión)</label>
          <CampoMonto name="monto_pesos" required className={claseCampo} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Comisión de esta transacción (pesos)</label>
          <CampoMonto name="comision_pesos" defaultValue={0} className={claseCampo} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">
            Monto a abonarle a su deuda (en {monedaProveedor === "USD" ? "dólares" : "pesos"})
          </label>
          <CampoMonto name="monto_abono" value={montoAbono} onChange={setMontoAbono} required className={claseCampo} />
        </div>
        {monedaProveedor === "USD" && (
          <div>
            <label className="block text-xs font-medium text-zinc-500">Dólares que le llegaron (si va a un contenedor)</label>
            <CampoMonto name="monto_dolares" value={montoDolares} onChange={setMontoDolares} className={claseCampo} />
          </div>
        )}
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

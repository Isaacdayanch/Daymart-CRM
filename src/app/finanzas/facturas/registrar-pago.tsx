"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoMonto } from "@/components/campo-monto";
import { Selector } from "@/components/selector";
import { SelectorCategoria } from "../selector-categoria";
import { formatoDolares, formatoFecha, formatoPesos } from "@/lib/formato";
import type { CategoriaFinanciera, CuentaFinanciera } from "@/lib/tipos";
import { claveProveedor, textoUltimoPago, type UltimosPagos } from "@/lib/ultimos-pagos";
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
  ultimos = {},
}: {
  facturas: FacturaOpcion[];
  cuentas: CuentaFinanciera[];
  categorias: CategoriaFinanciera[];
  ultimos?: UltimosPagos;
}) {
  const router = useRouter();
  // Propuesta "como la última vez" (Isaac, 6 oct): al elegir la factura se
  // busca el último pago a ese proveedor y se precargan modo (directo o
  // por cuenta puente), cuenta de origen y cuenta puente.
  const [facturaId, setFacturaId] = useState(facturas[0]?.id ?? "");
  const sugeridoDe = (id: string) => ultimos[claveProveedor(facturas.find((f) => f.id === id)?.proveedor)];
  const sugerido = sugeridoDe(facturaId);
  const nombreCuenta = (id: string | null) => cuentas.find((c) => c.id === id)?.nombre ?? null;
  const [modo, setModo] = useState<"DIRECTO" | "PUENTE">(() => sugeridoDe(facturas[0]?.id ?? "")?.via ?? "DIRECTO");
  const cuentaPropuesta = sugerido ? (sugerido.cuentaId ?? "") : (cuentas[0]?.id ?? "");
  const puentePropuesta = sugerido?.cuentaPuenteId ?? cuentas[1]?.id ?? cuentas[0]?.id ?? "";
  const [tieneComision, setTieneComision] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [version, setVersion] = useState(0);
  const hoyTexto = new Date().toISOString().slice(0, 10);

  if (facturas.length === 0) return null;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">Registrar pago de factura</h2>
      <div className="mt-3 flex gap-1.5 rounded-xl bg-zinc-100 p-1">
        {(["DIRECTO", "PUENTE"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setModo(m);
              setTieneComision(false);
            }}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
              modo === m ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {m === "DIRECTO" ? "Pago directo" : "A través de una cuenta puente"}
          </button>
        ))}
      </div>
      <form
        key={`${version}-${modo}`}
        action={async (formData) => {
          setEnviando(true);
          setError(null);
          formData.set("tiene_comision", tieneComision ? "true" : "false");
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
              onChange={(id) => {
                setFacturaId(id);
                const s = sugeridoDe(id);
                if (s) {
                  setModo(s.via);
                  setTieneComision(false);
                }
              }}
              opciones={facturas.map((f) => ({
                value: f.id,
                label: `${f.folio ? `Folio ${f.folio} — ` : ""}${f.proveedor} — saldo: ${
                  f.moneda === "USD" ? formatoDolares(f.saldo) : formatoPesos(f.saldo)
                }`,
              }))}
            />
          </div>
          {sugerido && <p className="mt-1 text-xs text-emerald-700">{textoUltimoPago(sugerido, nombreCuenta, formatoFecha)}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">
            {modo === "PUENTE" && tieneComision ? "Monto que se debitó" : "Monto que pagas"}
          </label>
          <CampoMonto name="monto" required className={claseCampo} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Cuenta de origen</label>
          <div className="mt-1">
            <Selector
              key={`cuenta-${facturaId}-${cuentaPropuesta}`}
              name="cuenta_id"
              defaultValue={cuentaPropuesta}
              opciones={[
                ...cuentas.map((c) => ({ value: c.id, label: c.nombre })),
                ...(modo === "DIRECTO" ? [{ value: "", label: "Sin cuenta (fue antes de usar el sistema)" }] : []),
              ]}
            />
          </div>
        </div>
        {modo === "PUENTE" ? (
          <div>
            <label className="block text-xs font-medium text-zinc-500">Cuenta puente destino</label>
            <div className="mt-1">
              <Selector
                key={`puente-${facturaId}-${puentePropuesta}`}
                name="cuenta_destino_id"
                defaultValue={puentePropuesta}
                opciones={cuentas.map((c) => ({ value: c.id, label: c.nombre }))}
              />
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-zinc-500">Categoría</label>
            <div className="mt-1">
              <SelectorCategoria categorias={categorias} />
            </div>
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

        {modo === "PUENTE" && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:col-span-2">
            <label className="flex items-center gap-2 text-xs font-medium text-zinc-700">
              <input
                type="checkbox"
                checked={tieneComision}
                onChange={(e) => setTieneComision(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300"
              />
              ¿La cuenta puente te cobró comisión al depositar?
            </label>
            {tieneComision && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-zinc-500">Monto neto que de verdad se abonó ahí</label>
                <CampoMonto name="monto_neto" required className={claseCampo} />
                <p className="mt-1 text-[11px] text-zinc-400">
                  La diferencia se guarda sola como gasto en &ldquo;Comisiones&rdquo;.
                </p>
              </div>
            )}
          </div>
        )}

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

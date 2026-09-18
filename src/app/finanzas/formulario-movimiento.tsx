"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoMonto } from "@/components/campo-monto";
import { Selector } from "@/components/selector";
import { formatoPesos } from "@/lib/formato";
import type { CategoriaFinanciera, CuentaFinanciera, TipoMovimientoFinanciero } from "@/lib/tipos";
import { registrarMovimiento, registrarPagoFactura } from "./actions";

export interface FacturaAbierta {
  id: string;
  etiqueta: string;
  saldo: number;
  moneda: string;
}

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

const TIPOS: { valor: TipoMovimientoFinanciero; etiqueta: string }[] = [
  { valor: "ENTRADA", etiqueta: "Agregar dinero" },
  { valor: "SALIDA", etiqueta: "Mandar dinero" },
  { valor: "TRANSFERENCIA", etiqueta: "Mover entre mis cuentas" },
];

export function FormularioMovimiento({
  cuentas,
  categorias,
  cuentaInicial,
  facturas = [],
}: {
  cuentas: CuentaFinanciera[];
  categorias: CategoriaFinanciera[];
  /** Viene de "+ Movimiento en esta cuenta" (estado de cuenta): la cuenta ya elegida. */
  cuentaInicial?: string;
  /** Facturas con saldo, para marcar un pago "a cuenta de una factura". */
  facturas?: FacturaAbierta[];
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoMovimientoFinanciero>("ENTRADA");
  const [tieneComision, setTieneComision] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Monto controlado para poder calcular la comisión en vivo.
  const [monto, setMonto] = useState("");
  // La comisión se puede capturar de tres formas: el neto que llegó, un
  // porcentaje (ej. 1.75%) o el monto de la comisión. Al servidor siempre
  // viaja el neto (monto − comisión), que es lo que el sistema guarda.
  const [modoComision, setModoComision] = useState<"NETO" | "PORCENTAJE" | "MONTO">("PORCENTAJE");
  const [porcentaje, setPorcentaje] = useState("");
  const [comisionMonto, setComisionMonto] = useState("");
  const [netoManual, setNetoManual] = useState("");
  const [facturaId, setFacturaId] = useState("");
  const [montoFactura, setMontoFactura] = useState("");

  const montoNum = Number(monto) || 0;
  const comisionCalculada =
    modoComision === "PORCENTAJE" ? Math.round(montoNum * (Number(porcentaje) || 0)) / 100 : modoComision === "MONTO" ? Number(comisionMonto) || 0 : montoNum - (Number(netoManual) || 0);
  const netoCalculado = Math.round((montoNum - comisionCalculada) * 100) / 100;
  const facturaElegida = facturas.find((f) => f.id === facturaId);

  const opcionesCuentas = cuentas.map((c) => ({ value: c.id, label: c.nombre }));
  const cuentaPorDefecto = cuentas.some((c) => c.id === cuentaInicial) ? cuentaInicial : opcionesCuentas[0]?.value;
  const opcionesCategorias = [
    { value: "", label: "Sin categoría" },
    ...categorias.map((c) => ({ value: c.id, label: c.nombre })),
  ];
  const hoyTexto = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">Registrar movimiento</h2>

      <div className="mt-3 flex flex-wrap gap-1.5 rounded-xl bg-zinc-100 p-1">
        {TIPOS.map((t) => (
          <button
            key={t.valor}
            type="button"
            onClick={() => {
              setTipo(t.valor);
              setTieneComision(false);
            }}
            className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
              tipo === t.valor ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {t.etiqueta}
          </button>
        ))}
      </div>

      <form
        key={tipo}
        action={async (formData) => {
          setEnviando(true);
          setError(null);
          formData.set("tipo", tipo);
          formData.set("tiene_comision", tieneComision ? "true" : "false");
          if (tieneComision) formData.set("monto_neto", String(netoCalculado));
          // "A cuenta de una factura": se registra como pago de factura (una
          // sola captura: el movimiento + el abono a la factura ligados).
          let resultado: { error: string | null } | undefined;
          if (tipo !== "ENTRADA" && facturaId) {
            formData.set("factura_id", facturaId);
            if (!montoFactura && tieneComision && netoCalculado > 0) formData.set("monto_factura", String(netoCalculado));
            if (tipo !== "TRANSFERENCIA") formData.delete("cuenta_destino_id");
            resultado = await registrarPagoFactura(formData);
          } else {
            resultado = await registrarMovimiento(formData);
          }
          setEnviando(false);
          if (resultado?.error) {
            setError(resultado.error);
          } else {
            setTieneComision(false);
            setMonto("");
            setPorcentaje("");
            setComisionMonto("");
            setNetoManual("");
            setFacturaId("");
            setMontoFactura("");
            router.refresh();
          }
        }}
        className="mt-4 space-y-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500">
              {tipo === "ENTRADA" ? "Cuenta destino" : tipo === "SALIDA" ? "Cuenta de origen" : "Cuenta origen"}
            </label>
            <div className="mt-1">
              <Selector key={cuentaPorDefecto} name="cuenta_id" defaultValue={cuentaPorDefecto} opciones={opcionesCuentas} />
            </div>
          </div>
          {tipo === "TRANSFERENCIA" ? (
            <div>
              <label className="block text-xs font-medium text-zinc-500">Cuenta destino</label>
              <div className="mt-1">
                <Selector
                  name="cuenta_destino_id"
                  defaultValue={opcionesCuentas[1]?.value ?? opcionesCuentas[0]?.value}
                  opciones={opcionesCuentas}
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-zinc-500">Categoría</label>
              <div className="mt-1">
                <Selector name="categoria_id" defaultValue="" opciones={opcionesCategorias} />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500">
              {tipo !== "ENTRADA" && tieneComision ? "Monto que se debitó" : "Monto"}
            </label>
            <CampoMonto name="monto" value={monto} onChange={setMonto} required className={claseCampo} />
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
        </div>

        {tipo !== "TRANSFERENCIA" && (
          <div>
            <label className="block text-xs font-medium text-zinc-500">
              {tipo === "ENTRADA" ? "¿De quién viene?" : "¿A quién le pagaste?"}
            </label>
            <input type="text" name="contraparte" placeholder="Opcional" className={claseCampo} />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-zinc-500">Notas</label>
          <input type="text" name="notas" placeholder="Opcional" className={claseCampo} />
        </div>

        {tipo !== "ENTRADA" && facturas.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-zinc-500">¿Es a cuenta de una factura? (opcional)</label>
            <div className="mt-1">
              <Selector
                defaultValue={facturaId}
                onChange={setFacturaId}
                opciones={[{ value: "", label: "No, es un movimiento normal" }, ...facturas.map((f) => ({ value: f.id, label: `${f.etiqueta} — debe ${formatoPesos(f.saldo)}` }))]}
              />
            </div>
            {facturaElegida && (
              <div className="mt-2">
                <label className="block text-xs font-medium text-zinc-500">Monto que se descuenta de la factura</label>
                <CampoMonto name="monto_factura" value={montoFactura} onChange={setMontoFactura} placeholder={String(tieneComision && netoCalculado > 0 ? netoCalculado : montoNum || "")} className={claseCampo} />
                <p className="mt-1 text-[11px] text-zinc-400">
                  Si lo dejas vacío se descuenta {tieneComision && netoCalculado > 0 ? `el neto que llega (${formatoPesos(netoCalculado)})` : "el monto completo"}. La factura se marca pagada sola cuando su saldo llega a cero.
                </p>
              </div>
            )}
          </div>
        )}

        {tipo !== "ENTRADA" && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <label className="flex items-center gap-2 text-xs font-medium text-zinc-700">
              <input
                type="checkbox"
                checked={tieneComision}
                onChange={(e) => setTieneComision(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300"
              />
              ¿Tuvo comisión esta transacción?
            </label>
            {tieneComision && (
              <div className="mt-3 space-y-3">
                <div className="flex overflow-hidden rounded-lg border border-zinc-300 text-xs">
                  {(
                    [
                      ["PORCENTAJE", "Porcentaje"],
                      ["MONTO", "Monto de la comisión"],
                      ["NETO", "Neto que llegó"],
                    ] as const
                  ).map(([valor, etiqueta]) => (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => setModoComision(valor)}
                      className={`flex-1 px-3 py-1.5 ${modoComision === valor ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:text-zinc-900"}`}
                    >
                      {etiqueta}
                    </button>
                  ))}
                </div>
                {modoComision === "PORCENTAJE" && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-500">Comisión (%)</label>
                    <div className="relative mt-1 w-40">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={porcentaje}
                        onChange={(e) => setPorcentaje(e.target.value)}
                        placeholder="Ej. 1.75"
                        className="block w-full rounded-lg border border-zinc-300 px-3 py-2 pr-8 text-sm focus:border-zinc-500 focus:ring-zinc-500"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-zinc-400">%</span>
                    </div>
                  </div>
                )}
                {modoComision === "MONTO" && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-500">Comisión (monto)</label>
                    <CampoMonto value={comisionMonto} onChange={setComisionMonto} className={claseCampo} />
                  </div>
                )}
                {modoComision === "NETO" && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-500">
                      {tipo === "TRANSFERENCIA" ? "Monto neto que realmente llegó a la cuenta destino" : "Monto neto que realmente le llegó al destinatario"}
                    </label>
                    <CampoMonto value={netoManual} onChange={setNetoManual} className={claseCampo} />
                  </div>
                )}
                <p className="text-[11px] text-zinc-500">
                  {montoNum > 0 && comisionCalculada > 0 && comisionCalculada < montoNum ? (
                    <>
                      Se debitan <strong>{formatoPesos(montoNum)}</strong>: llegan <strong>{formatoPesos(netoCalculado)}</strong> y <strong>{formatoPesos(comisionCalculada)}</strong> se guardan solos como gasto en “Comisiones”.
                    </>
                  ) : (
                    "Pon el monto y la comisión para ver el cálculo."
                  )}
                </p>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={enviando}
            className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 disabled:opacity-50"
          >
            {enviando ? "Guardando..." : "Registrar"}
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BotonGuardar } from "@/components/boton-guardar";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoMonto } from "@/components/campo-monto";
import { CampoSugerencias } from "@/components/campo-sugerencias";
import { Selector } from "@/components/selector";
import { comisionSospechosa, mensajeComisionSospechosa } from "@/lib/comisiones";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { estadoGasto, pagosDelConcepto, tipoCambioEfectivo, totalPagadoPesos, type EstadoGasto } from "@/lib/pagos-gastos";
import { CONCEPTOS_GASTO_CONTENEDOR, type ConceptoGastoContenedor, type Contenedor, type Moneda, type PagoGastoContenedor } from "@/lib/tipos";
import { eliminarPagoGastoContenedor, registrarPagoGastoContenedor } from "./pagos-gastos-actions";

const claseCampo = "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export interface DeudaAbierta {
  proveedor: string;
  moneda: Moneda;
  saldo: number;
}

/** Lo que se recuerda del último pago de cada concepto (en cualquier
 * contenedor): a quién se le pagó y de qué cuenta, para proponerlo. */
export interface SugerenciasPagos {
  proveedores: string[];
  ultimoProveedor: Partial<Record<ConceptoGastoContenedor, string>>;
  ultimaCuenta: Partial<Record<ConceptoGastoContenedor, string>>;
}

type DatosContenedor = Pick<
  Contenedor,
  "flete_dolares" | "flete_tipo_cambio" | "flete_estimado" | "aduana_pesos" | "aduana_estimada" | "otros_gastos_dolares" | "otros_gastos_tipo_cambio" | "otros_gastos_estimado"
>;

const usd = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;

const PASTILLA: Record<EstadoGasto, { texto: string; clase: string }> = {
  ESTIMADO: { texto: "Estimado", clase: "bg-amber-50 text-amber-800 ring-amber-600/20" },
  PAGADO: { texto: "Pagado", clase: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  REAL: { texto: "Real", clase: "bg-zinc-100 text-zinc-600 ring-zinc-500/10" },
  SIN_MONTO: { texto: "Sin monto", clase: "bg-zinc-100 text-zinc-500 ring-zinc-500/10" },
};

/** Tarjeta "Pagos del contenedor" (3 nov; Isaac: "quitarle el botón de
 * estimado y ponerle un botón para que se registre el pago"): flete, aduana
 * y otros gastos con su estado (estimado / pagado / real), sus pagos y el
 * formulario para registrar uno. Cada pago sale de una cuenta en Finanzas y
 * el contenedor toma el monto real al quedar pagado completo. */
export function PagosGastos({
  contenedorId,
  contenedor,
  pagos,
  cuentas,
  sugerencias,
  deudas,
}: {
  contenedorId: string;
  contenedor: DatosContenedor;
  pagos: PagoGastoContenedor[];
  cuentas: { id: string; nombre: string }[];
  sugerencias: SugerenciasPagos;
  deudas: DeudaAbierta[];
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6">
      <p className="text-sm font-medium text-zinc-700">Pagos del contenedor: flete, aduana y otros gastos</p>
      <p className="mt-1 text-xs text-zinc-500">
        Un monto cuenta como <span className="font-medium text-amber-700">estimado</span> hasta que registras su pago. Al registrarlo, sale de la cuenta que elijas en Finanzas y el
        contenedor toma lo que de verdad pagaste (pesos + comisión); el costo por pieza se recalcula solo.
      </p>
      <ul className="mt-2 divide-y divide-zinc-100">
        {CONCEPTOS_GASTO_CONTENEDOR.map((c) => (
          <RenglonConcepto key={c.valor} contenedorId={contenedorId} definicion={c} contenedor={contenedor} pagos={pagos} cuentas={cuentas} sugerencias={sugerencias} deudas={deudas} />
        ))}
      </ul>
    </div>
  );
}

function RenglonConcepto({
  contenedorId,
  definicion,
  contenedor,
  pagos,
  cuentas,
  sugerencias,
  deudas,
}: {
  contenedorId: string;
  definicion: (typeof CONCEPTOS_GASTO_CONTENEDOR)[number];
  contenedor: DatosContenedor;
  pagos: PagoGastoContenedor[];
  cuentas: { id: string; nombre: string }[];
  sugerencias: SugerenciasPagos;
  deudas: DeudaAbierta[];
}) {
  const router = useRouter();
  const concepto = definicion.valor;
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [pesos, setPesos] = useState("");
  const [comision, setComision] = useState("");
  const [dolares, setDolares] = useState("");
  const [proveedor, setProveedor] = useState(sugerencias.ultimoProveedor[concepto] ?? "");
  const [completo, setCompleto] = useState(true);

  const propios = pagosDelConcepto(pagos, concepto);
  const estado = estadoGasto(contenedor, concepto, pagos);
  const cuentasPorId = new Map(cuentas.map((c) => [c.id, c.nombre]));
  const hoy = new Date().toISOString().slice(0, 10);

  const pesosNum = Number(pesos) || 0;
  const comisionNum = Number(comision) || 0;
  const dolaresNum = Number(dolares) || 0;
  const tc = tipoCambioEfectivo(pesosNum, comisionNum, dolaresNum);
  const sospechosa = comisionNum > 0 && comisionSospechosa(comisionNum, pesosNum + comisionNum);
  const etiquetaMin = definicion.etiqueta.toLowerCase();

  const montoTexto = (() => {
    if (concepto === "ADUANA") return contenedor.aduana_pesos > 0 ? formatoPesos(contenedor.aduana_pesos) : null;
    const d = concepto === "FLETE" ? contenedor.flete_dolares : contenedor.otros_gastos_dolares;
    const t = concepto === "FLETE" ? contenedor.flete_tipo_cambio : contenedor.otros_gastos_tipo_cambio;
    if (!(d > 0)) return null;
    return `${usd(d)} × ${t.toFixed(4)} = ${formatoPesos(d * t)}`;
  })();

  async function quitar(id: string) {
    if (!confirm("¿Quitar este pago? También se quita su salida en Finanzas y el monto del contenedor se recalcula.")) return;
    setQuitando(id);
    setError(null);
    const r = await eliminarPagoGastoContenedor(contenedorId, id);
    setQuitando(null);
    if (r.error) setError(r.error);
    else router.refresh();
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-zinc-900">{definicion.etiqueta}</p>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${PASTILLA[estado].clase}`}>{PASTILLA[estado].texto}</span>
          <p className="text-xs text-zinc-500">{montoTexto ?? "sin monto"}</p>
        </div>
        {!abierto && (
          <button type="button" onClick={() => setAbierto(true)} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
            {propios.length > 0 ? "+ Otro pago" : "Registrar pago"}
          </button>
        )}
      </div>

      {propios.length > 0 && (
        <ul className="mt-2 space-y-1">
          {propios.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600">
              <span>
                <span className="font-medium text-zinc-800">{formatoFecha(p.fecha)}</span> · {p.cuenta_id ? (cuentasPorId.get(p.cuenta_id) ?? "cuenta") : "sin cuenta"} ·{" "}
                <span className="font-medium text-zinc-800">{formatoPesos(totalPagadoPesos(p))}</span>
                {p.comision_pesos > 0 && <> (incluye comisión {formatoPesos(p.comision_pesos)})</>}
                {p.monto_dolares ? <> · {usd(p.monto_dolares)}</> : null}
                {p.proveedor && <> · {p.proveedor}</>}
                {p.abono_deuda_id && <> · abonado a su deuda</>}
              </span>
              <button type="button" onClick={() => quitar(p.id)} disabled={quitando === p.id} className="text-zinc-400 hover:text-red-600 disabled:opacity-50">
                {quitando === p.id ? "quitando…" : "quitar"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {abierto && (
        <form
          action={async (formData) => {
            setEnviando(true);
            setError(null);
            const r = await registrarPagoGastoContenedor(contenedorId, concepto, formData);
            setEnviando(false);
            if (r.error) {
              setError(r.error);
              return;
            }
            setAbierto(false);
            setPesos("");
            setComision("");
            setDolares("");
            router.refresh();
          }}
          className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4"
        >
          <p className="text-xs font-medium text-zinc-700">Registrar pago de {etiquetaMin}</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-500">Fecha</label>
              <CampoFecha name="fecha" defaultValue={hoy} max={hoy} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">¿De qué cuenta salió?</label>
              <div className="mt-1">
                <Selector
                  name="cuenta_id"
                  defaultValue={sugerencias.ultimaCuenta[concepto] ?? ""}
                  placeholder="Elige la cuenta"
                  opciones={[...cuentas.map((c) => ({ value: c.id, label: c.nombre })), { value: "SIN_CUENTA", label: "Sin cuenta (fue antes de usar el sistema)" }]}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Pesos que salieron</label>
              <CampoMonto name="monto_pesos" value={pesos} onChange={setPesos} required className={claseCampo} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Comisión (opcional)</label>
              <CampoMonto name="comision_pesos" value={comision} onChange={setComision} className={claseCampo} />
              <p className="mt-1 text-[11px] text-zinc-400">Se suma al costo del {etiquetaMin}, igual que en los abonos.</p>
            </div>
            {definicion.enDolares && (
              <div>
                <label className="block text-xs font-medium text-zinc-500">Dólares de {etiquetaMin} que pagaste</label>
                <CampoMonto name="monto_dolares" value={dolares} onChange={setDolares} required className={claseCampo} />
                <p className="mt-1 text-[11px] text-zinc-500">
                  {tc > 0 ? (
                    <>
                      Tipo de cambio efectivo: <span className="font-medium text-zinc-700">{tc.toFixed(4)}</span> ({formatoPesos(pesosNum + comisionNum)} ÷ {usd(dolaresNum)})
                    </>
                  ) : (
                    "El tipo de cambio sale solo: (pesos + comisión) ÷ dólares."
                  )}
                </p>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-zinc-500">¿A quién le pagaste?</label>
              <CampoSugerencias name="proveedor" value={proveedor} onChange={setProveedor} sugerencias={sugerencias.proveedores} placeholder={concepto === "ADUANA" ? "Agente aduanal" : "Forwarder"} className={claseCampo} />
            </div>
            {deudas.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-zinc-500">¿Aplica a una deuda ya registrada en Finanzas → Proveedores?</label>
                <div className="mt-1">
                  <Selector
                    name="deuda_proveedor"
                    defaultValue=""
                    opciones={[
                      { value: "", label: "No, es un pago suelto" },
                      ...deudas.map((d) => ({
                        value: `${d.proveedor}|${d.moneda}`,
                        label: `${d.proveedor} · debes ${d.moneda === "USD" ? usd(d.saldo) : formatoPesos(d.saldo)}`,
                      })),
                    ]}
                  />
                </div>
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-500">Notas (opcional)</label>
              <input type="text" name="notas" className={claseCampo} placeholder="Ej. factura del forwarder, número de referencia…" />
            </div>
          </div>

          <label className="mt-3 flex items-start gap-2 text-xs text-zinc-700">
            <input type="checkbox" name="completo" value="true" checked={completo} onChange={(e) => setCompleto(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-zinc-300" />
            <span>
              {completo ? (
                <>
                  Con este pago el {etiquetaMin} queda <span className="font-medium">pagado completo</span>: el contenedor toma el monto pagado y deja de ser estimado.
                </>
              ) : (
                <>
                  Es un <span className="font-medium">pago parcial</span>: el monto del contenedor se queda como está (estimado) hasta que registres el resto.
                </>
              )}
            </span>
          </label>

          {sospechosa && (
            <p className="mt-2 text-xs text-red-700" role="alert">
              {mensajeComisionSospechosa(comisionNum, pesosNum + comisionNum, formatoPesos)}
            </p>
          )}
          {error && (
            <p className="mt-2 text-xs text-red-700" role="alert">
              {error}
            </p>
          )}

          <div className="mt-3 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setAbierto(false);
                setError(null);
              }}
              className="text-xs text-zinc-500 hover:text-zinc-900"
            >
              Cancelar
            </button>
            <BotonGuardar cargando={enviando} textoCargando="Registrando…" mostrarListo={false} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
              Registrar pago
            </BotonGuardar>
          </div>
        </form>
      )}
      {!abierto && error && (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Selector } from "@/components/selector";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoMonto } from "@/components/campo-monto";
import { BotonGuardar } from "@/components/boton-guardar";
import { ivaIncluido } from "@/lib/calculos-compras";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import type { CondicionesPago, CuentaFinanciera, FacturaPendiente, PagoFactura } from "@/lib/tipos";
import { guardarFacturaOrden, registrarPagoOrden } from "../actions";

const claseInput = "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

/** La cuenta por pagar de la orden (vive en Finanzas → Facturas): folio de
 * la factura del proveedor o "sin factura", fecha límite, pagos (anticipo,
 * al recibir o abonos) y saldo. Los pagos salen de la cuenta que elijas, es
 * el mismo registro que en Finanzas. */
export function FacturaPagos({
  ordenId,
  factura,
  pagos,
  cuentas,
  saldo,
  condiciones,
}: {
  ordenId: string;
  factura: FacturaPendiente;
  pagos: PagoFactura[];
  cuentas: CuentaFinanciera[];
  saldo: number;
  condiciones: CondicionesPago;
}) {
  const router = useRouter();
  const hoyTexto = new Date().toISOString().slice(0, 10);
  const sinFacturaGuardada = /sin factura/i.test(factura.notas ?? "");
  const [editandoFactura, setEditandoFactura] = useState(false);
  const [sinFactura, setSinFactura] = useState(sinFacturaGuardada);
  const [errorFactura, setErrorFactura] = useState<string | null>(null);
  const [guardandoFactura, setGuardandoFactura] = useState(false);
  const [errorPago, setErrorPago] = useState<string | null>(null);
  const [guardandoPago, setGuardandoPago] = useState(false);
  const nombreCuenta = (id: string | null) => cuentas.find((c) => c.id === id)?.nombre ?? "sin cuenta";
  const pagado = pagos.reduce((s, p) => s + p.monto, 0);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-6 py-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Factura y pagos</h3>
          <p className="text-xs text-zinc-500">
            Cuenta por pagar de {formatoPesos(factura.monto)}
            {sinFacturaGuardada ? " · sin factura (nota de remisión)" : factura.folio ? ` · factura ${factura.folio}` : " · sin folio todavía"}
            {factura.fecha_limite ? ` · vence ${formatoFecha(factura.fecha_limite)}` : ""}
            {" · "}
            <Link href="/finanzas/facturas" className="text-[#2D3277] hover:underline">
              ver en Finanzas
            </Link>
          </p>
        </div>
        <button type="button" onClick={() => setEditandoFactura((v) => !v)} className="text-xs text-zinc-500 hover:text-zinc-900">
          {editandoFactura ? "cerrar" : factura.folio || sinFacturaGuardada ? "cambiar factura / fecha límite" : "poner folio de factura"}
        </button>
      </div>

      {editandoFactura && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setGuardandoFactura(true);
            setErrorFactura(null);
            const r = await guardarFacturaOrden(ordenId, new FormData(e.currentTarget));
            setGuardandoFactura(false);
            if (r.error) {
              setErrorFactura(r.error);
              return;
            }
            setEditandoFactura(false);
            router.refresh();
          }}
          className="border-b border-zinc-100 bg-zinc-50/60 px-6 py-4"
        >
          <input type="hidden" name="sin_factura" value={sinFactura ? "true" : "false"} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500">¿Te dio factura?</label>
              <div className="mt-1 flex gap-1 rounded-full bg-zinc-100 p-0.5 text-xs">
                {(
                  [
                    [false, "Sí, con folio"],
                    [true, "No, nota de remisión"],
                  ] as const
                ).map(([valor, etiqueta]) => (
                  <button key={String(valor)} type="button" onClick={() => setSinFactura(valor)} className={`flex-1 rounded-full px-3 py-1 font-medium transition ${sinFactura === valor ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"}`}>
                    {etiqueta}
                  </button>
                ))}
              </div>
            </div>
            {!sinFactura && (
              <div>
                <label className="block text-xs font-medium text-zinc-500">Folio de la factura</label>
                <input type="text" name="folio" defaultValue={factura.folio ?? ""} placeholder="Ej. A-1234" className={claseInput} />
                <p className="mt-1 text-[11px] text-zinc-400">IVA incluido en la cuenta: {formatoPesos(ivaIncluido(factura.monto))}</p>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-zinc-500">Fecha límite de pago</label>
              <div className="mt-1">
                <CampoFecha name="fecha_limite" defaultValue={factura.fecha_limite ? factura.fecha_limite.slice(0, 10) : ""} />
              </div>
              <p className="mt-1 text-[11px] text-zinc-400">
                {condiciones === "ANTICIPADO" ? "Se paga al pedir." : condiciones === "AL_RECIBIR" ? "Se calcula sola al recibir; cámbiala si acordaron otra." : "Se calcula sola: recepción + días de crédito."}
              </p>
            </div>
          </div>
          {errorFactura && <p className="mt-2 text-sm text-red-600">{errorFactura}</p>}
          <div className="mt-3 flex justify-end">
            <BotonGuardar cargando={guardandoFactura} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
              Guardar
            </BotonGuardar>
          </div>
        </form>
      )}

      {pagos.length === 0 ? (
        <p className="px-6 py-4 text-sm text-zinc-400">Todavía no le has pagado nada de esta orden.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {pagos
            .slice()
            .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
            .map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-6 py-3">
                <div>
                  <p className="text-sm font-medium text-zinc-900">{formatoPesos(p.monto)}</p>
                  <p className="text-xs text-zinc-400">
                    {formatoFecha(p.fecha)} · {nombreCuenta(p.cuenta_id)}
                    {p.notas ? ` · ${p.notas}` : ""}
                  </p>
                </div>
                <Link href="/finanzas/facturas" className="text-xs text-zinc-400 hover:text-zinc-900">
                  corregir en Finanzas
                </Link>
              </li>
            ))}
          <li className="flex items-center justify-between px-6 py-2 text-xs text-zinc-500">
            <span>Pagado</span>
            <span className="font-medium text-zinc-700">{formatoPesos(pagado)}</span>
          </li>
        </ul>
      )}

      {saldo > 0.01 && (
        <form
          className="border-t border-zinc-100 p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setGuardandoPago(true);
            setErrorPago(null);
            const r = await registrarPagoOrden(ordenId, new FormData(e.currentTarget));
            setGuardandoPago(false);
            if (r.error) {
              setErrorPago(r.error);
              return;
            }
            router.refresh();
          }}
        >
          <p className="text-xs font-medium text-zinc-500">
            Registrar un pago {condiciones === "ANTICIPADO" ? "(anticipo)" : "(puede ser parcial)"} — faltan {formatoPesos(saldo)}
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500">Monto</label>
              <div className="mt-1">
                <CampoMonto name="monto" defaultValue={Math.round(saldo * 100) / 100} required />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">De qué cuenta sale</label>
              <div className="mt-1">
                <Selector name="cuenta_id" defaultValue={cuentas[0]?.id} opciones={cuentas.map((c) => ({ value: c.id, label: c.nombre }))} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Fecha</label>
              <div className="mt-1">
                <CampoFecha name="fecha" defaultValue={hoyTexto} max={hoyTexto} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Notas (opcional)</label>
              <input type="text" name="notas" className={claseInput} />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-zinc-400">Si lo pagaste a través de una cuenta puente o con comisión, regístralo mejor en Finanzas → Facturas → &ldquo;Registrar pago de factura&rdquo;: ahí están esas opciones.</p>
          {errorPago && <p className="mt-2 text-sm text-red-600">{errorPago}</p>}
          <div className="mt-3 flex justify-end">
            <BotonGuardar cargando={guardandoPago} textoCargando="Registrando…" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
              Registrar pago
            </BotonGuardar>
          </div>
        </form>
      )}
    </div>
  );
}

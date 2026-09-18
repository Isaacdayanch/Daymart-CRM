"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoMonto } from "@/components/campo-monto";
import { CampoSugerencias } from "@/components/campo-sugerencias";
import { Selector } from "@/components/selector";
import { formatoPesos } from "@/lib/formato";
import type { CuentaFinanciera, Moneda } from "@/lib/tipos";
import { mandarDineroChina } from "./actions";
import type { FacturaAbierta } from "./formulario-movimiento";

const claseCampo = "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export interface DatosChina {
  proveedores: string[];
  contenedores: { id: string; numero: number; proveedor: string | null }[];
  abonosPendientes: { id: string; contenedor_id: string; monto_dolares: number; fecha_limite: string | null }[];
}

type ModoComision = "DESPUES" | "PORCENTAJE" | "MONTO" | "NETO";

/** Un solo formulario para mandar dinero a un proveedor chino (casi siempre
 * a través de Jaime). Si la comisión no se sabe todavía, queda un pendiente
 * ámbar y se completa cuando llega el recibo. */
export function FormularioEnvioChina({ cuentas, datos, facturas, cuentaInicial }: { cuentas: CuentaFinanciera[]; datos: DatosChina; facturas: FacturaAbierta[]; cuentaInicial?: string }) {
  const router = useRouter();
  const opcionesCuentas = cuentas.map((c) => ({ value: c.id, label: c.nombre }));
  const [cuentaOrigen, setCuentaOrigen] = useState(cuentas.some((c) => c.id === cuentaInicial) ? cuentaInicial! : (opcionesCuentas[0]?.value ?? ""));
  const [via, setVia] = useState<"PUENTE" | "DIRECTO">("PUENTE");
  const [cuentaPuente, setCuentaPuente] = useState(opcionesCuentas.find((c) => c.value !== cuentaOrigen)?.value ?? "");
  const [monto, setMonto] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [moneda, setMoneda] = useState<Moneda>("USD");
  const [contenedorId, setContenedorId] = useState("");
  const [abonoId, setAbonoId] = useState("");
  const [dolares, setDolares] = useState("");
  const [modo, setModo] = useState<ModoComision>("DESPUES");
  const [valor, setValor] = useState("");
  const [facturaId, setFacturaId] = useState("");
  const [notas, setNotas] = useState("");
  const hoyTexto = new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(hoyTexto);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const montoNum = Number(monto) || 0;
  const v = Number(valor) || 0;
  const comision = modo === "PORCENTAJE" ? Math.round(montoNum * v) / 100 : modo === "MONTO" ? v : modo === "NETO" ? montoNum - v : null;
  const neto = comision !== null ? Math.round((montoNum - comision) * 100) / 100 : null;
  const pendientesDelContenedor = datos.abonosPendientes.filter((a) => a.contenedor_id === contenedorId);

  return (
    <form
      action={async (formData) => {
        setEnviando(true);
        setError(null);
        setExito(null);
        const r = await mandarDineroChina(formData);
        setEnviando(false);
        if (r?.error) setError(r.error);
        else {
          setExito(r.pendiente ? "Registrado. Queda pendiente la comisión: cuando llegue el recibo, complétalo desde el aviso ámbar." : "Registrado completo: salida, abono al proveedor y contenedor.");
          setMonto("");
          setDolares("");
          setValor("");
          setNotas("");
          setFacturaId("");
          router.refresh();
        }
      }}
      className="mt-4 space-y-3"
    >
      <input type="hidden" name="via" value={via} />
      <input type="hidden" name="comision_modo" value={modo} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-zinc-500">¿De qué cuenta sale?</label>
          <div className="mt-1">
            <Selector name="cuenta_origen_id" defaultValue={cuentaOrigen} onChange={setCuentaOrigen} opciones={opcionesCuentas} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">¿A través de quién?</label>
          <div className="mt-1 flex gap-2">
            <div className="flex overflow-hidden rounded-lg border border-zinc-300 text-xs">
              <button type="button" onClick={() => setVia("PUENTE")} className={`px-3 py-2 ${via === "PUENTE" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600"}`}>
                Intermediario
              </button>
              <button type="button" onClick={() => setVia("DIRECTO")} className={`px-3 py-2 ${via === "DIRECTO" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600"}`}>
                Directo
              </button>
            </div>
            {via === "PUENTE" && (
              <div className="flex-1">
                <Selector name="cuenta_puente_id" defaultValue={cuentaPuente} onChange={setCuentaPuente} placeholder="Cuenta puente (ej. Jaim T.)" opciones={opcionesCuentas.filter((c) => c.value !== cuentaOrigen)} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500">¿Cuántos pesos mandas?</label>
          <CampoMonto name="monto_pesos" value={monto} onChange={setMonto} required className={claseCampo} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">¿Para qué proveedor?</label>
          <CampoSugerencias name="proveedor" value={proveedor} onChange={setProveedor} sugerencias={datos.proveedores} placeholder="Ej. Joseph Senado" />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Su deuda está en</label>
          <div className="mt-1">
            <Selector
              name="moneda_proveedor"
              defaultValue={moneda}
              onChange={(m) => setMoneda(m as Moneda)}
              opciones={[
                { value: "USD", label: "Dólares (USD)" },
                { value: "MXN", label: "Pesos (MXN)" },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Contenedor (opcional)</label>
          <div className="mt-1">
            <Selector
              name="contenedor_id"
              defaultValue={contenedorId}
              onChange={(id) => {
                setContenedorId(id);
                setAbonoId("");
                const c = datos.contenedores.find((x) => x.id === id);
                if (c?.proveedor && !proveedor) setProveedor(c.proveedor);
              }}
              opciones={[{ value: "", label: "Sin contenedor" }, ...datos.contenedores.map((c) => ({ value: c.id, label: `Contenedor ${c.numero}` }))]}
            />
          </div>
        </div>
        {pendientesDelContenedor.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-amber-900">¿A qué abono pendiente aplica?</label>
            <div className="mt-1">
              <Selector
                name="abono_pendiente_id"
                defaultValue={abonoId}
                onChange={(id) => {
                  setAbonoId(id);
                  const a = datos.abonosPendientes.find((x) => x.id === id);
                  if (a) setDolares(String(a.monto_dolares));
                }}
                opciones={[{ value: "", label: "Es un abono nuevo" }, ...pendientesDelContenedor.map((a) => ({ value: a.id, label: `Pendiente de $${a.monto_dolares.toLocaleString("es-MX")} USD` }))]}
              />
            </div>
          </div>
        )}
        {(moneda === "USD" || contenedorId) && (
          <div>
            <label className="block text-xs font-medium text-zinc-500">Dólares que le llegan {modo === "DESPUES" ? "(si ya sabes)" : ""}</label>
            <CampoMonto name="monto_dolares" value={dolares} onChange={setDolares} className={claseCampo} />
          </div>
        )}
      </div>

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
        <p className="text-xs font-medium text-zinc-700">¿Ya sabes la comisión?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <div className="flex overflow-hidden rounded-lg border border-zinc-300 text-xs">
            {(
              [
                ["DESPUES", "La sé después"],
                ["PORCENTAJE", "Porcentaje"],
                ["MONTO", "Monto"],
                ["NETO", "Neto que llega"],
              ] as const
            ).map(([m, etiqueta]) => (
              <button key={m} type="button" onClick={() => setModo(m)} className={`px-3 py-1.5 ${modo === m ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:text-zinc-900"}`}>
                {etiqueta}
              </button>
            ))}
          </div>
          {modo === "PORCENTAJE" && (
            <div className="relative w-32">
              <input type="number" step="0.01" min={0} name="comision_valor" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="1.75" className="block w-full rounded-lg border border-zinc-300 px-3 py-1.5 pr-7 text-sm" />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-zinc-400">%</span>
            </div>
          )}
          {(modo === "MONTO" || modo === "NETO") && <CampoMonto name="comision_valor" value={valor} onChange={setValor} className="block w-40 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm" />}
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">
          {modo === "DESPUES"
            ? via === "PUENTE"
              ? "Hoy se registra la transferencia a la cuenta puente. Queda un aviso ámbar hasta que pongas la comisión del recibo."
              : "Si es directo, necesitas poner la comisión (o 0)."
            : montoNum > 0 && comision !== null && comision >= 0 && comision < montoNum
              ? `Salen ${formatoPesos(montoNum)}: al proveedor llegan ${formatoPesos(neto ?? 0)} y ${formatoPesos(comision)} de comisión se absorben al costo de la mercancía.`
              : "Pon el monto y la comisión para ver el cálculo."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Fecha</label>
          <CampoFecha name="fecha" defaultValue={fecha} onChange={setFecha} max={hoyTexto} required />
        </div>
        {facturas.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-zinc-500">¿A cuenta de una factura?</label>
            <div className="mt-1">
              <Selector name="factura_id" defaultValue={facturaId} onChange={setFacturaId} opciones={[{ value: "", label: "No" }, ...facturas.map((f) => ({ value: f.id, label: `${f.etiqueta} — debe ${formatoPesos(f.saldo)}` }))]} />
            </div>
          </div>
        )}
        <div className={facturas.length > 0 ? "" : "sm:col-span-2"}>
          <label className="block text-xs font-medium text-zinc-500">Notas</label>
          <input type="text" name="notas" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" className={claseCampo} />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {exito && <p className="text-sm text-emerald-700">{exito}</p>}
      <div className="flex justify-end pt-1">
        <button type="submit" disabled={enviando} className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 disabled:opacity-50">
          {enviando ? "Guardando..." : modo === "DESPUES" ? "Registrar pago (comisión después)" : "Registrar pago completo"}
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoMonto } from "@/components/campo-monto";
import { Selector } from "@/components/selector";
import type { CategoriaFinanciera, CuentaFinanciera, TipoMovimientoFinanciero } from "@/lib/tipos";
import { registrarMovimiento } from "./actions";

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
}: {
  cuentas: CuentaFinanciera[];
  categorias: CategoriaFinanciera[];
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoMovimientoFinanciero>("ENTRADA");
  const [tieneComision, setTieneComision] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const opcionesCuentas = cuentas.map((c) => ({ value: c.id, label: c.nombre }));
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
          const resultado = await registrarMovimiento(formData);
          setEnviando(false);
          if (resultado?.error) {
            setError(resultado.error);
          } else {
            setTieneComision(false);
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
              <Selector name="cuenta_id" defaultValue={opcionesCuentas[0]?.value} opciones={opcionesCuentas} />
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
            <CampoMonto name="monto" required className={claseCampo} />
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
              <div className="mt-3">
                <label className="block text-xs font-medium text-zinc-500">
                  {tipo === "TRANSFERENCIA"
                    ? "Monto neto que realmente llegó a la cuenta destino"
                    : "Monto neto que realmente le llegó al destinatario"}
                </label>
                <CampoMonto name="monto_neto" required className={claseCampo} />
                <p className="mt-1 text-[11px] text-zinc-400">
                  La diferencia entre el monto que se debitó y este monto neto se guarda sola como gasto en
                  &ldquo;Comisiones&rdquo;.
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

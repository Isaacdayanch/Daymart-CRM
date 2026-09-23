"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoMonto } from "@/components/campo-monto";
import { Selector } from "@/components/selector";
import { SelectorCategoria } from "../selector-categoria";
import type { CategoriaFinanciera, CuentaFinanciera, MovimientoFinanciero } from "@/lib/tipos";
import { actualizarMovimiento } from "../actions";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

type Eleccion = "ENTRADA" | "SALIDA" | "AJUSTE";

const ELECCIONES: { valor: Eleccion; etiqueta: string; ayuda: string }[] = [
  { valor: "ENTRADA", etiqueta: "Entrada", ayuda: "Dinero que entró" },
  { valor: "SALIDA", etiqueta: "Salida", ayuda: "Gasto o pago que salió" },
  { valor: "AJUSTE", etiqueta: "Ajuste", ayuda: "Para cuadrar con el banco" },
];

/** Formulario para corregir un movimiento "suelto" (se usa en el libro de
 * Movimientos y en el estado de cuenta). Al editar pregunta qué es:
 * Entrada, Salida o Ajuste — una transferencia se queda como transferencia. */
export function FormularioEditarMovimiento({
  movimiento: m,
  cuentas,
  categorias,
  esAjuste,
  alTerminar,
}: {
  movimiento: MovimientoFinanciero;
  cuentas: CuentaFinanciera[];
  categorias: CategoriaFinanciera[];
  esAjuste: boolean;
  alTerminar: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [eleccion, setEleccion] = useState<Eleccion>(esAjuste ? "AJUSTE" : m.tipo === "SALIDA" ? "SALIDA" : "ENTRADA");
  const [ajusteSigno, setAjusteSigno] = useState<"SUMA" | "RESTA">(m.tipo === "SALIDA" ? "RESTA" : "SUMA");
  const hoyTexto = new Date().toISOString().slice(0, 10);
  const esTransferencia = m.tipo === "TRANSFERENCIA";

  return (
    <form
      action={async (formData) => {
        setEnviando(true);
        setError(null);
        const resultado = await actualizarMovimiento(m.id, formData);
        setEnviando(false);
        if (resultado?.error) setError(resultado.error);
        else {
          alTerminar();
          router.refresh();
        }
      }}
      className="grid gap-3 sm:grid-cols-3"
    >
      {!esTransferencia && (
        <div className="sm:col-span-3">
          <label className="block text-xs font-medium text-zinc-500">¿Qué es este movimiento?</label>
          <input type="hidden" name="tipo_edicion" value={eleccion} />
          <input type="hidden" name="ajuste_signo" value={ajusteSigno} />
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-zinc-300 text-xs">
              {ELECCIONES.map((e) => (
                <button
                  key={e.valor}
                  type="button"
                  title={e.ayuda}
                  onClick={() => setEleccion(e.valor)}
                  className={`px-3 py-1.5 ${eleccion === e.valor ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:text-zinc-900"}`}
                >
                  {e.etiqueta}
                </button>
              ))}
            </div>
            {eleccion === "AJUSTE" && (
              <div className="flex overflow-hidden rounded-lg border border-amber-300 text-xs">
                {(["SUMA", "RESTA"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setAjusteSigno(s)}
                    className={`px-3 py-1.5 ${ajusteSigno === s ? "bg-amber-500 text-white" : "bg-white text-amber-700 hover:bg-amber-50"}`}
                  >
                    {s === "SUMA" ? "Suma al saldo" : "Resta del saldo"}
                  </button>
                ))}
              </div>
            )}
            <span className="text-[11px] text-zinc-400">{ELECCIONES.find((e) => e.valor === eleccion)?.ayuda}</span>
          </div>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-zinc-500">Monto</label>
        <CampoMonto name="monto" defaultValue={m.monto} required className={claseCampo} />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500">Fecha</label>
        <CampoFecha name="fecha" defaultValue={m.fecha.slice(0, 10)} max={hoyTexto} required />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500">{eleccion === "ENTRADA" && !esTransferencia ? "Cuenta destino" : "Cuenta"}</label>
        <div className="mt-1">
          <Selector name="cuenta_id" defaultValue={m.cuenta_id} opciones={cuentas.map((c) => ({ value: c.id, label: c.nombre }))} />
        </div>
      </div>
      {esTransferencia ? (
        <div>
          <label className="block text-xs font-medium text-zinc-500">Cuenta destino</label>
          <div className="mt-1">
            <Selector
              name="cuenta_destino_id"
              defaultValue={m.cuenta_destino_id ?? ""}
              opciones={cuentas.map((c) => ({ value: c.id, label: c.nombre }))}
            />
          </div>
        </div>
      ) : eleccion === "AJUSTE" ? (
        <div>
          <label className="block text-xs font-medium text-zinc-500">Categoría</label>
          <p className="mt-2 text-sm text-amber-700">Ajuste de saldo (se pone sola)</p>
        </div>
      ) : (
        <div>
          <label className="block text-xs font-medium text-zinc-500">Categoría</label>
          <div className="mt-1">
            <SelectorCategoria categorias={categorias} defaultId={esAjuste ? "" : (m.categoria_id ?? "")} />
          </div>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-zinc-500">Contraparte</label>
        <input type="text" name="contraparte" defaultValue={m.contraparte ?? ""} className={claseCampo} />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500">Notas</label>
        <input type="text" name="notas" defaultValue={m.notas ?? ""} className={claseCampo} />
      </div>
      {error && <p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
      <div className="flex gap-2 sm:col-span-3">
        <button
          type="submit"
          disabled={enviando}
          className="rounded-lg bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {enviando ? "Guardando..." : "Guardar"}
        </button>
        <button type="button" onClick={alTerminar} className="text-xs font-medium text-zinc-400 hover:text-zinc-700">
          Cancelar
        </button>
      </div>
    </form>
  );
}

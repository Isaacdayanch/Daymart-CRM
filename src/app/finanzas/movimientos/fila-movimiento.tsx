"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatoDolares, formatoPesos } from "@/lib/formato";
import { fechaTextoMx } from "@/lib/fechas-mx";
import { CATEGORIA_AJUSTE } from "@/lib/estado-cuenta";
import type { CategoriaFinanciera, CuentaFinanciera, MovimientoFinanciero } from "@/lib/tipos";
import { eliminarMovimiento, intercambiarMontosComision } from "../actions";
import { FormularioComision } from "../formulario-comision";
import { FormularioEditarMovimiento } from "./formulario-editar-movimiento";

const ETIQUETA_TIPO: Record<string, string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  TRANSFERENCIA: "Transferencia",
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Un renglón del libro: fecha en bloque, concepto (contraparte + notas +
 * cuenta/categoría en chiquito) y monto grande a la derecha. Es una lista,
 * no una tabla, para que en el celular no se apriete ni haga scroll
 * horizontal. Si al movimiento le falta la comisión, se captura AQUÍ mismo
 * (misma transacción), no en otra pantalla. */
export function FilaMovimiento({
  movimiento: m,
  cuentas,
  categorias,
  cuentaNombre,
  cuentaDestinoNombre,
  categoriaNombre,
  origenLigado,
  principal = null,
  comisionLigada = null,
}: {
  movimiento: MovimientoFinanciero;
  cuentas: CuentaFinanciera[];
  categorias: CategoriaFinanciera[];
  cuentaNombre: string;
  cuentaDestinoNombre: string;
  categoriaNombre: string;
  /** Si viene de otra pantalla (pago de factura, abono a proveedor…), de dónde. */
  origenLigado: string | null;
  /** Si ESTE renglón es la comisión de otro movimiento, ese movimiento. */
  principal?: MovimientoFinanciero | null;
  /** Si este movimiento tiene una comisión guardada aparte, esa comisión. */
  comisionLigada?: MovimientoFinanciero | null;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [comision, setComision] = useState(false);
  const [intercambiando, setIntercambiando] = useState(false);
  const [errorIntercambio, setErrorIntercambio] = useState<string | null>(null);
  const formato = (n: number) => (m.moneda === "USD" ? formatoDolares(n) : formatoPesos(n));
  // Comisión más grande que el movimiento al que pertenece = casi seguro
  // quedaron al revés (caso real del 15 oct). Se ofrece intercambiarlos aquí
  // mismo, en una sola operación, en vez de editar dos renglones a mano.
  const alReves = Boolean(principal && m.monto > principal.monto);
  // Día y mes en calendario de Ciudad de México (igual que el estado de cuenta).
  const [, mesTexto, diaTexto] = fechaTextoMx(new Date(m.fecha)).split("-");
  const esEntrada = m.tipo === "ENTRADA";
  const esSalida = m.tipo === "SALIDA";
  const titulo = m.contraparte || (categoriaNombre !== "—" ? categoriaNombre : ETIQUETA_TIPO[m.tipo]);
  const monto = m.moneda === "USD" ? formatoDolares(m.monto) : formatoPesos(m.monto);

  if (editando) {
    return (
      <li className="bg-zinc-50 p-4 sm:px-6">
        <FormularioEditarMovimiento
          movimiento={m}
          cuentas={cuentas}
          categorias={categorias}
          esAjuste={categoriaNombre === CATEGORIA_AJUSTE}
          alTerminar={() => setEditando(false)}
        />
      </li>
    );
  }

  return (
    <li className="px-4 py-3.5 sm:px-6">
      <div className="flex items-start gap-3 sm:gap-4">
        {/* Fecha en bloque */}
        <div className="w-11 shrink-0 text-center leading-tight">
          <p className="text-lg font-semibold text-zinc-900">{Number(diaTexto)}</p>
          <p className="text-[11px] uppercase tracking-wide text-zinc-400">{MESES[Number(mesTexto) - 1]}</p>
        </div>

        {/* Concepto */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate font-medium text-zinc-900">{titulo}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                esEntrada
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                  : esSalida
                    ? "bg-red-50 text-red-700 ring-red-600/20"
                    : "bg-sky-50 text-sky-700 ring-sky-600/20"
              }`}
            >
              {ETIQUETA_TIPO[m.tipo]}
            </span>
            {m.comision_pendiente && !comision && (
              <button
                type="button"
                onClick={() => setComision(true)}
                className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20 hover:bg-amber-200"
              >
                falta comisión · ponerla
              </button>
            )}
          </div>
          {m.notas && <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{m.notas}</p>}
          <p className="mt-1 text-xs text-zinc-400">
            <span className="text-zinc-500">{cuentaNombre}</span>
            {m.tipo === "TRANSFERENCIA" && (
              <>
                {" → "}
                <span className="text-zinc-500">{cuentaDestinoNombre}</span>
              </>
            )}
            {categoriaNombre !== "—" && m.contraparte && <> · {categoriaNombre}</>}
            {origenLigado && <> · viene de {origenLigado}, se corrige desde ahí</>}
            {principal && (
              <>
                {" · "}comisión de la {ETIQUETA_TIPO[principal.tipo]?.toLowerCase() ?? "transacción"} de {formato(principal.monto)}
              </>
            )}
            {comisionLigada && <> · + comisión {formato(comisionLigada.monto)} aparte</>}
          </p>
          {alReves && principal && (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
              <p>
                Esta comisión ({formato(m.monto)}) es más grande que el movimiento al que pertenece ({formato(principal.monto)}). Casi seguro quedaron al revés.
              </p>
              <button
                type="button"
                disabled={intercambiando}
                onClick={async () => {
                  if (!confirm(`¿Intercambiar los montos? El movimiento quedará en ${formato(m.monto)} y la comisión en ${formato(principal.monto)}.`)) return;
                  setIntercambiando(true);
                  setErrorIntercambio(null);
                  const r = await intercambiarMontosComision(m.id);
                  setIntercambiando(false);
                  if (r?.error) setErrorIntercambio(r.error);
                  else {
                    if (r?.nota) alert(r.nota);
                    router.refresh();
                  }
                }}
                className="mt-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {intercambiando ? "Corrigiendo…" : `Intercambiar: movimiento ${formato(m.monto)} · comisión ${formato(principal.monto)}`}
              </button>
              {errorIntercambio && <p className="mt-1.5">{errorIntercambio}</p>}
            </div>
          )}
        </div>

        {/* Monto + acciones */}
        <div className="shrink-0 text-right">
          <p className={`text-base font-semibold tabular-nums ${esEntrada ? "text-emerald-600" : esSalida ? "text-red-600" : "text-zinc-900"}`}>
            {esSalida ? "−" : esEntrada ? "+" : ""}
            {monto}
          </p>
          {!origenLigado && (
            <div className="mt-1 flex items-center justify-end gap-2 text-[11px]">
              <button type="button" onClick={() => setEditando(true)} className="text-zinc-400 hover:text-zinc-900 hover:underline">
                editar
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm("¿Quitar este movimiento? No se puede deshacer.")) return;
                  const resultado = await eliminarMovimiento(m.id);
                  if (resultado?.error) alert(resultado.error);
                  else router.refresh();
                }}
                className="text-zinc-400 hover:text-red-600 hover:underline"
              >
                quitar
              </button>
            </div>
          )}
        </div>
      </div>
      {comision && (
        <div className="mt-3 sm:ml-[3.75rem]">
          <FormularioComision movimientoId={m.id} monto={m.monto} alTerminar={() => setComision(false)} />
        </div>
      )}
    </li>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoMonto } from "@/components/campo-monto";
import { formatoDolares, formatoPesos } from "@/lib/formato";
import type { Moneda } from "@/lib/tipos";
import { ajustarSaldoCuenta } from "../../actions";

/** "Ajustar saldo": Isaac pone el saldo real del banco/caja y el sistema
 * registra la diferencia como "Ajuste de saldo". Escondido en un
 * desplegable para no estorbar. */
export function AjustarSaldo({ cuentaId, moneda, saldoSistema, hoyTexto }: { cuentaId: string; moneda: Moneda; saldoSistema: number; hoyTexto: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [saldoReal, setSaldoReal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const dinero = (v: number) => (moneda === "USD" ? formatoDolares(v) : formatoPesos(v));
  const diferencia = saldoReal === "" ? null : Number(saldoReal) - saldoSistema;

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="text-xs text-zinc-400 hover:text-zinc-700">
        ¿No cuadra con el banco? Ajustar saldo
      </button>
    );
  }

  return (
    <form
      action={async (formData) => {
        setEnviando(true);
        setError(null);
        const r = await ajustarSaldoCuenta(cuentaId, formData);
        setEnviando(false);
        if (r?.error) setError(r.error);
        else {
          setAbierto(false);
          setSaldoReal("");
          router.refresh();
        }
      }}
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"
    >
      <p className="font-medium text-amber-900">Ajustar saldo al real</p>
      <p className="text-xs text-amber-800">
        El sistema dice {dinero(saldoSistema)}. Escribe el saldo que ves hoy en el banco (o en tu caja) y se registra la diferencia como “Ajuste de saldo”, sin inventar un gasto.
      </p>
      <input type="hidden" name="moneda" value={moneda} />
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-amber-900">Saldo real</label>
          <CampoMonto name="saldo_real" value={saldoReal} onChange={setSaldoReal} className="mt-1 block w-48 rounded-lg border border-amber-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-amber-900">Fecha del ajuste</label>
          <div className="mt-1">
            <CampoFecha name="fecha" defaultValue={hoyTexto} max={hoyTexto} required />
          </div>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-amber-900">Nota (opcional)</label>
          <input type="text" name="notas" className="mt-1 block w-full rounded-lg border border-amber-300 px-3 py-2 text-sm" placeholder="Ej. comisión bancaria no registrada" />
        </div>
      </div>
      {diferencia !== null && Number.isFinite(diferencia) && (
        <p className="mt-2 text-xs text-amber-900">
          Se registraría {diferencia >= 0 ? "una entrada" : "una salida"} de <strong>{dinero(Math.abs(diferencia))}</strong> como ajuste.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={enviando || !saldoReal} className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50">
          {enviando ? "Guardando…" : "Registrar ajuste"}
        </button>
        <button type="button" onClick={() => setAbierto(false)} className="text-xs text-amber-800 hover:text-amber-900">
          Cancelar
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoMonto } from "@/components/campo-monto";
import { formatoPesos } from "@/lib/formato";
import { completarComisionMovimiento } from "./actions";

/** Mini formulario para ponerle la comisión a un movimiento marcado "la sé
 * después" — se usa en el aviso ámbar de Resumen y en la misma fila del
 * libro de Movimientos, para que Isaac la capture desde donde la vea. La
 * comisión se guarda aparte (categoría "Comisiones") ligada al movimiento,
 * y el movimiento baja al neto: es la MISMA transacción, no un registro
 * suelto. */
export function FormularioComision({ movimientoId, monto, alTerminar }: { movimientoId: string; monto: number; alTerminar?: () => void }) {
  const router = useRouter();
  const [modo, setModo] = useState<"PORCENTAJE" | "MONTO" | "NETO">("PORCENTAJE");
  const [valor, setValor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const v = Number(valor) || 0;
  const comision = modo === "PORCENTAJE" ? Math.round(monto * v) / 100 : modo === "MONTO" ? v : monto - v;

  return (
    <form
      action={async (formData) => {
        setEnviando(true);
        setError(null);
        const r = await completarComisionMovimiento(movimientoId, formData);
        setEnviando(false);
        if (r?.error) setError(r.error);
        else {
          alTerminar?.();
          router.refresh();
        }
      }}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-amber-200 bg-white p-3"
    >
      <input type="hidden" name="comision_modo" value={modo} />
      <div>
        <label className="block text-[11px] font-medium text-zinc-500">Comisión de esta transacción</label>
        <div className="mt-1 flex gap-1">
          <div className="flex overflow-hidden rounded-lg border border-zinc-300 text-xs">
            {(
              [
                ["PORCENTAJE", "%"],
                ["MONTO", "$"],
                ["NETO", "Neto"],
              ] as const
            ).map(([mm, t]) => (
              <button key={mm} type="button" onClick={() => setModo(mm)} className={`px-2.5 py-1.5 ${modo === mm ? "bg-zinc-900 text-white" : "bg-white text-zinc-600"}`}>
                {t}
              </button>
            ))}
          </div>
          {modo === "PORCENTAJE" ? (
            <input
              type="number"
              step="0.01"
              min={0}
              name="comision_valor"
              value={valor}
              onChange={(ev) => setValor(ev.target.value)}
              placeholder="1.75"
              className="w-24 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
            />
          ) : (
            <CampoMonto name="comision_valor" value={valor} onChange={setValor} className="block w-36 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm" />
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={enviando} className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50">
          {enviando ? "Guardando…" : "Guardar comisión"}
        </button>
        {alTerminar && (
          <button type="button" onClick={alTerminar} className="text-xs text-zinc-400 hover:text-zinc-700">
            Cancelar
          </button>
        )}
      </div>
      {valor && comision >= 0 && comision < monto && (
        <p className="w-full text-[11px] text-zinc-500">
          Comisión {formatoPesos(comision)}: esta transacción queda en {formatoPesos(monto - comision)} y la comisión se anota aparte en “Comisiones”, ligada a ella.
        </p>
      )}
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </form>
  );
}

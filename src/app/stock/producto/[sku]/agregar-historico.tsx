"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoMonto } from "@/components/campo-monto";
import { Selector } from "@/components/selector";
import { agregarHistoricoProducto } from "../../actions";

const claseCampo = "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

/** "Agregar histórico de antes del sistema" en la ficha del producto: Isaac
 * captura entradas y salidas totales (de su Google Sheets). Si ya había
 * cargado el stock inicial a mano, puede pedir que el histórico lo
 * reemplace para no contar doble. */
export function AgregarHistorico({
  sku,
  stockActual,
  manualesCargadas,
  registradas,
  bodegas,
}: {
  sku: string;
  stockActual: number;
  /** Piezas que entraron por cargas manuales (sin contenedor, no históricas). */
  manualesCargadas: number;
  /** Ya registrado en el sistema (sin histórico ni manuales): entradas de
   * contenedores/ajustes que suman, y salidas/ajustes que restan. */
  registradas: { entradas: number; salidas: number };
  bodegas: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const hoyTexto = new Date().toISOString().slice(0, 10);
  const [abierto, setAbierto] = useState(false);
  const [entradas, setEntradas] = useState("");
  const [salidas, setSalidas] = useState("");
  const [reemplazar, setReemplazar] = useState(manualesCargadas > 0);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Lo que el sistema ya tiene registrado (si se van a borrar las manuales, no cuentan).
  const sistemaEntradas = registradas.entradas + (reemplazar ? 0 : manualesCargadas);
  const sistemaSalidas = registradas.salidas;
  const haySistema = sistemaEntradas > 0 || sistemaSalidas > 0;
  const [restar, setRestar] = useState(haySistema);
  const totalEntradas = Number(entradas) || 0;
  const totalSalidas = Number(salidas) || 0;
  const histEntradas = restar ? Math.max(0, totalEntradas - sistemaEntradas) : totalEntradas;
  const histSalidas = restar ? Math.max(0, totalSalidas - sistemaSalidas) : totalSalidas;
  const quedara = stockActual - (reemplazar ? manualesCargadas : 0) + histEntradas - histSalidas;

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
        Agregar histórico de antes del sistema
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        setEnviando(true);
        setError(null);
        fd.set("reemplazar_manuales", reemplazar ? "true" : "false");
        fd.set("restar_registrado", restar ? "true" : "false");
        const r = await agregarHistoricoProducto(sku, fd);
        setEnviando(false);
        if (r?.error) setError(r.error);
        else {
          setAbierto(false);
          router.refresh();
        }
      }}
      className="w-full rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-left"
    >
      <p className="text-sm font-semibold text-zinc-900">Histórico de antes del sistema</p>
      <p className="mt-0.5 text-xs text-zinc-600">De tu Google Sheets: cuántas piezas han entrado y salido en total de este producto.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Han entrado en total</label>
          <input type="number" name="entradas_total" min={1} required value={entradas} onChange={(e) => setEntradas(e.target.value)} className={claseCampo} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Han salido en total</label>
          <input type="number" name="salidas_total" min={0} value={salidas} onChange={(e) => setSalidas(e.target.value)} className={claseCampo} />
        </div>
        <div className="rounded-lg border border-emerald-200 bg-white p-3">
          <p className="text-xs text-emerald-800">Stock después</p>
          <p className={`text-xl font-semibold ${quedara < 0 ? "text-red-600" : "text-emerald-900"}`}>{quedara.toLocaleString("es-MX")} pzas</p>
          <p className="text-[10px] text-zinc-400">hoy: {stockActual.toLocaleString("es-MX")}</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Fecha de corte</label>
          <div className="mt-1">
            <CampoFecha name="fecha" defaultValue={hoyTexto} max={hoyTexto} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Bodega</label>
          <div className="mt-1">
            <Selector name="bodega_id" defaultValue={bodegas[0]?.id} opciones={bodegas.map((b) => ({ value: b.id, label: b.nombre }))} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Costo por pieza (opcional)</label>
          <CampoMonto name="costo_unitario_pesos" className={claseCampo} />
          <p className="text-[10px] text-zinc-400">Vacío = costo promedio actual</p>
        </div>
      </div>
      {haySistema && (
        <label className="mt-3 flex items-start gap-2 text-xs text-zinc-700">
          <input type="checkbox" checked={restar} onChange={(e) => setRestar(e.target.checked)} className="mt-0.5" />
          <span>
            Mis totales de la hoja <strong>ya incluyen</strong> lo que el sistema tiene registrado (entraron {sistemaEntradas.toLocaleString("es-MX")}
            {sistemaSalidas > 0 && <> y salieron {sistemaSalidas.toLocaleString("es-MX")}</>}): réstalo para no contar doble.
            {restar && (totalEntradas > 0 || totalSalidas > 0) && (
              <span className="block text-[11px] text-zinc-500">
                Se guardan como histórico: {histEntradas.toLocaleString("es-MX")} entradas y {histSalidas.toLocaleString("es-MX")} salidas.
                {(totalEntradas > 0 && totalEntradas < sistemaEntradas) || totalSalidas < sistemaSalidas ? " Ojo: tus totales son menores a lo registrado, revisa los números." : ""}
              </span>
            )}
          </span>
        </label>
      )}
      {manualesCargadas > 0 && (
        <label className="mt-3 flex items-start gap-2 text-xs text-zinc-700">
          <input type="checkbox" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)} className="mt-0.5" />
          <span>
            Este histórico <strong>reemplaza</strong> las {manualesCargadas.toLocaleString("es-MX")} piezas que ya habías cargado a mano (se quitan esas entradas manuales para no contar doble).
          </span>
        </label>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" disabled={enviando} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {enviando ? "Guardando…" : "Guardar histórico"}
        </button>
        <button type="button" onClick={() => setAbierto(false)} className="text-xs text-zinc-500 hover:text-zinc-900">
          Cancelar
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </form>
  );
}

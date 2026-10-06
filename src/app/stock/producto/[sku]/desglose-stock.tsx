import type { MovimientoStock } from "@/lib/tipos";

/** "¿De dónde sale el stock actual?": suma cada tipo de movimiento por
 * origen, para que Isaac vea en un vistazo si algo se contó doble (caso
 * real de los yoga blocks, 6 oct). La suma de todos los renglones es
 * exactamente el stock actual. */
export function DesgloseStock({ movimientos, stockActual }: { movimientos: MovimientoStock[]; stockActual: number }) {
  const renglones: { etiqueta: string; piezas: number }[] = [];
  const suma = (etiqueta: string, lista: MovimientoStock[], signo: 1 | -1 = 1) => {
    const total = lista.reduce((s, m) => s + m.cantidad, 0);
    if (total !== 0) renglones.push({ etiqueta, piezas: signo * total });
  };
  const esML = (m: MovimientoStock) => Boolean(m.orden_ml_id);
  const esFull = (m: MovimientoStock) => Boolean(m.envio_full_id || m.recepcion_full_id || m.inbound_ml_id);
  const entradas = movimientos.filter((m) => m.tipo === "ENTRADA");
  const salidas = movimientos.filter((m) => m.tipo === "SALIDA");
  const ajustes = movimientos.filter((m) => m.tipo === "AJUSTE");

  suma("Histórico de antes del sistema (entradas)", entradas.filter((m) => m.historico));
  suma("Histórico de antes del sistema (salidas)", salidas.filter((m) => m.historico), -1);
  suma("Entradas de contenedores", entradas.filter((m) => !m.historico && m.contenedor_id));
  suma("Entradas cargadas a mano", entradas.filter((m) => !m.historico && !m.contenedor_id && !m.venta_id));
  suma("Ajustes de recepción de contenedor", ajustes.filter((m) => m.contenedor_id));
  suma("Devoluciones de Mercado Libre (regresaron)", ajustes.filter((m) => esML(m)));
  suma("Ajustes y devoluciones a mano", ajustes.filter((m) => !m.contenedor_id && !esML(m)));
  suma("Salidas por ventas directas", salidas.filter((m) => !m.historico && m.venta_id), -1);
  suma("Salidas por ventas de Mercado Libre", salidas.filter((m) => !m.historico && esML(m)), -1);
  suma("Salidas a Full", salidas.filter((m) => !m.historico && !esML(m) && esFull(m)), -1);
  suma("Otras salidas capturadas a mano", salidas.filter((m) => !m.historico && !m.venta_id && !esML(m) && !esFull(m)), -1);

  if (renglones.length === 0) return null;
  return (
    <details className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <summary className="cursor-pointer text-xs font-medium text-zinc-700">
        ¿De dónde sale el stock actual ({stockActual.toLocaleString("es-MX")})? Ver desglose
      </summary>
      <ul className="mt-2 divide-y divide-zinc-100 text-xs">
        {renglones.map((r) => (
          <li key={r.etiqueta} className="flex items-center justify-between py-1.5">
            <span className="text-zinc-600">{r.etiqueta}</span>
            <span className={`font-semibold tabular-nums ${r.piezas < 0 ? "text-sky-700" : "text-emerald-700"}`}>
              {r.piezas > 0 ? "+" : "−"}
              {Math.abs(r.piezas).toLocaleString("es-MX")}
            </span>
          </li>
        ))}
        <li className="flex items-center justify-between py-1.5 font-semibold text-zinc-900">
          <span>Stock actual</span>
          <span className="tabular-nums">{stockActual.toLocaleString("es-MX")}</span>
        </li>
      </ul>
      <p className="mt-2 text-[11px] text-zinc-400">
        Si un renglón no cuadra con lo que esperabas, ahí está el problema: el histórico se corrige con &ldquo;Corregir histórico&rdquo; y los movimientos a mano desde Stock → Movimientos.
      </p>
    </details>
  );
}

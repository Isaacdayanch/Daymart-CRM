import type { OcupacionContenedor } from "@/lib/calculos";

function Barra({ etiqueta, usado, limite, pct, unidad }: { etiqueta: string; usado: string; limite: string; pct: number; unidad: string }) {
  const color = pct > 100 ? "bg-red-500" : pct >= 90 ? "bg-amber-500" : "bg-emerald-500";
  const texto = pct > 100 ? "text-red-700" : pct >= 90 ? "text-amber-700" : "text-zinc-900";
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-zinc-500">{etiqueta}</span>
        <span className={`font-semibold tabular-nums ${texto}`}>
          {usado} de {limite} {unidad} · {Math.round(pct)}%
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

/** Tarjeta "Ocupación del contenedor": peso contra el límite de carretera y
 * espacio contra la capacidad, con la lectura de qué conviene meter. */
export function TarjetaOcupacion({ ocupacion: o }: { ocupacion: OcupacionContenedor }) {
  const borde = o.nivel === "excedido" ? "border-red-200 bg-red-50/60" : o.nivel === "atencion" ? "border-amber-200 bg-amber-50/60" : "border-zinc-200 bg-white";
  const colorAviso = o.nivel === "excedido" ? "text-red-800" : o.nivel === "atencion" ? "text-amber-800" : "text-zinc-600";
  return (
    <div className={`rounded-xl border p-4 ${borde}`}>
      <p className="text-xs font-medium text-zinc-700">Ocupación del contenedor</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Barra etiqueta="Peso" usado={Math.round(o.pesoKg).toLocaleString("es-MX")} limite={o.limitePesoKg.toLocaleString("es-MX")} pct={o.pctPeso} unidad="kg" />
        <Barra etiqueta="Espacio" usado={o.cbm.toFixed(1)} limite={String(o.capacidadCbm)} pct={o.pctCbm} unidad="m³" />
      </div>
      <p className={`mt-3 text-xs ${colorAviso}`}>{o.aviso}</p>
      <p className="mt-1 text-[11px] text-zinc-400">
        El límite de peso es el de carretera en México para un 40 pies (21,000 kg; 23,000 con sobrecargo, 26,000 por tren). Cámbialo en Editar si tu agente te autoriza otro.
      </p>
    </div>
  );
}

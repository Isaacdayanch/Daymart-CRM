import { ventaVencida } from "@/lib/calculos-ventas";
import type { Venta } from "@/lib/tipos";

/** Pastilla de estado de una venta: pagada, a crédito con saldo, o vencida. */
export function EstadoVenta({ venta, saldo }: { venta: Pick<Venta, "forma_pago" | "fecha_limite">; saldo: number }) {
  const pagada = saldo <= 0.01;
  const vencida = ventaVencida(venta, saldo);
  const estilo = pagada
    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
    : vencida
      ? "bg-red-50 text-red-700 ring-red-600/20"
      : "bg-amber-50 text-amber-700 ring-amber-600/20";
  const etiqueta = pagada ? (venta.forma_pago === "CONTADO" ? "Contado" : "Pagada") : vencida ? "Vencida" : "A crédito";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${estilo}`}>{etiqueta}</span>;
}

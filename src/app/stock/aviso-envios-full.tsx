import Link from "next/link";
import { enviosPorConfirmar, obtenerEnviosFullMl } from "@/lib/mercadolibre-envios-full";

/** Aviso arriba de todas las pantallas de Stock: Mercado Libre ya recibió
 * un envío a Full y falta que Isaac confirme la salida de bodega. */
export async function AvisoEnviosFull() {
  let pendientes: ReturnType<typeof enviosPorConfirmar> = [];
  try {
    pendientes = enviosPorConfirmar(await obtenerEnviosFullMl());
  } catch {
    return null;
  }
  if (!pendientes.length) return null;
  const piezas = pendientes.reduce((s, e) => s + e.envio.piezas_recibidas, 0);
  return (
    <div className="mb-6 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 print:hidden">
      <p className="font-medium">
        Mercado Libre ya recibió {pendientes.length === 1 ? "un envío a Full" : `${pendientes.length} envíos a Full`}
        {piezas > 0 && <> ({piezas.toLocaleString("es-MX")} piezas)</>}: falta confirmar la salida de tu bodega.
      </p>
      <p className="mt-0.5 text-xs text-emerald-800">
        {pendientes.map((e) => e.envio.inbound_id).join(", ")} ·{" "}
        <Link href="/stock/full#envios-ml" className="font-medium underline underline-offset-2">
          Confirmar →
        </Link>
      </p>
    </div>
  );
}

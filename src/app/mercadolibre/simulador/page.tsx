import { obtenerConexion } from "@/lib/mercadolibre-auth";
import { FormularioSimulador } from "./formulario-simulador";

export default async function Simulador() {
  const conexion = await obtenerConexion().catch(() => null);
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Lo mismo que el simulador de costos de Mercado Libre, pero con tus números: pega el link de un producto
        parecido (para tomar su categoría), pon tu precio y las medidas del paquete, y te dice la comisión, el envío y
        cuánto te queda. Consulta a Mercado Libre en vivo con tu cuenta.
      </p>
      {!conexion && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Mercado Libre no está conectado; la comisión no se puede consultar hasta conectar.
        </div>
      )}
      <FormularioSimulador />
    </div>
  );
}

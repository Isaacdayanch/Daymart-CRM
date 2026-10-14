import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fechaTextoMx } from "@/lib/fechas-mx";
import { ESTADOS_CONTENEDOR, type Contenedor } from "@/lib/tipos";
import { formatoFechaCorta, llegadasProximas, textoLlegada } from "@/lib/avisos-contenedores";

/** Aviso: contenedores en camino que llegan en 7 días o menos (o que ya
 * debían haber llegado y siguen sin marcarse recibidos). Se usa en la
 * lista de Contenedores y en el inicio. */
export async function AvisoLlegadas() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contenedores")
    .select("id, numero, estado, fecha_estimada_llegada, eliminado_en")
    .is("eliminado_en", null)
    .returns<Pick<Contenedor, "id" | "numero" | "estado" | "fecha_estimada_llegada" | "eliminado_en">[]>();
  if (error || !data) return null; // sin el SQL 0051 simplemente no hay aviso
  const lista = llegadasProximas(data, fechaTextoMx(new Date()));
  if (!lista.length) return null;
  const etiqueta = (estado: Contenedor["estado"]) => ESTADOS_CONTENEDOR.find((e) => e.valor === estado)?.etiqueta ?? estado;
  return (
    <div className="mb-6 rounded-xl border border-[#2D3277]/20 bg-[#2D3277]/5 p-4 text-sm text-[#2D3277] print:hidden">
      <p className="font-medium">Contenedores por llegar</p>
      <ul className="mt-1 space-y-0.5 text-xs">
        {lista.map((l) => (
          <li key={l.contenedor.id} className={l.vencida ? "text-amber-800" : ""}>
            <Link href={`/contenedores/${l.contenedor.id}`} className="font-medium underline-offset-2 hover:underline">
              Contenedor {l.contenedor.numero}
            </Link>{" "}
            {textoLlegada(l)} ({formatoFechaCorta(l.contenedor.fecha_estimada_llegada as string)}) · sigue en “{etiqueta(l.contenedor.estado)}”
            {l.vencida && ": si ya llegó, actualiza su estado; si no, corrige la fecha estimada"}
          </li>
        ))}
      </ul>
    </div>
  );
}

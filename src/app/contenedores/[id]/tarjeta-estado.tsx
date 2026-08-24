"use client";

import { useRouter } from "next/navigation";
import { ESTADOS_CONTENEDOR, type EstadoContenedor } from "@/lib/tipos";
import { ESTILO_ESTADO } from "@/lib/formato";
import { cambiarEstado } from "./actions";

export function TarjetaEstado({
  contenedorId,
  estado,
  stockGeneradoEn,
}: {
  contenedorId: string;
  estado: EstadoContenedor;
  stockGeneradoEn: string | null;
}) {
  const router = useRouter();

  function alCambiar(nuevoEstado: EstadoContenedor) {
    // Recibir en bodega ya no es un clic simple: hay que confirmar cuánto
    // llegó de verdad y eso genera el stock automático.
    if (nuevoEstado === "RECIBIDO_BODEGA" && !stockGeneradoEn) {
      router.push(`/contenedores/${contenedorId}/recibir`);
      return;
    }
    cambiarEstado(contenedorId, nuevoEstado);
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xs text-zinc-500">Estado</p>
      <select
        value={estado}
        onChange={(e) => alCambiar(e.target.value as EstadoContenedor)}
        className={`mt-1 w-full rounded-full border-0 px-2.5 py-1 text-xs font-medium ring-1 ring-inset focus:ring-2 ${ESTILO_ESTADO[estado]}`}
      >
        {ESTADOS_CONTENEDOR.map((e) => (
          <option key={e.valor} value={e.valor}>
            {e.etiqueta}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => {
          const el = document.getElementById("documentacion") as HTMLDetailsElement | null;
          if (el) {
            el.open = true;
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }}
        className="mt-2 text-xs font-medium text-zinc-500 hover:text-zinc-900"
      >
        📄 Ver documentación
      </button>
    </div>
  );
}

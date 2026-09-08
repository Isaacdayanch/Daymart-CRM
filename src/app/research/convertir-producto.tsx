"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Selector } from "@/components/selector";
import { convertirEnProducto } from "./actions";

interface ContenedorOpcion {
  id: string;
  numero: number;
}

export function ConvertirProducto({
  borradorId,
  categoriaSugerida,
  contenedores,
}: {
  borradorId: string;
  categoriaSugerida: string | null;
  contenedores: ContenedorOpcion[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        disabled={contenedores.length === 0}
        className="text-sm font-medium text-emerald-600 hover:text-emerald-800 disabled:cursor-not-allowed disabled:text-zinc-300"
      >
        Convertir en producto →
      </button>
    );
  }

  return (
    <form
      action={async (formData) => {
        setEnviando(true);
        setError(null);
        const resultado = await convertirEnProducto(borradorId, formData);
        setEnviando(false);
        if (resultado?.error) {
          setError(resultado.error);
        } else {
          setAbierto(false);
          router.refresh();
        }
      }}
      className="mt-3 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3"
    >
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Contenedor</label>
          <div className="mt-1">
            <Selector
              name="contenedor_id"
              defaultValue={contenedores[0]?.id}
              opciones={contenedores.map((c) => ({ value: c.id, label: `Contenedor ${c.numero}` }))}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Cantidad</label>
          <input
            type="number"
            name="cantidad"
            min={1}
            required
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500">Categoría</label>
        <input
          type="text"
          name="categoria"
          defaultValue={categoriaSugerida ?? ""}
          className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Fábrica</label>
          <input
            type="text"
            name="fabrica"
            placeholder="Opcional"
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Proveedor</label>
          <input
            type="text"
            name="proveedor"
            placeholder="Opcional"
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="rounded-lg px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={enviando}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {enviando ? "Guardando..." : "Confirmar"}
        </button>
      </div>
    </form>
  );
}

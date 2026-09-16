"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatoPesos } from "@/lib/formato";
import type { Cliente } from "@/lib/tipos";
import { actualizarCliente, eliminarCliente } from "../actions";

export function FilaCliente({
  cliente,
  ventas,
  comprado,
  saldo,
}: {
  cliente: Cliente;
  ventas: number;
  comprado: number;
  saldo: number;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const claseInput = "block w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-500 focus:ring-zinc-500";

  if (editando) {
    return (
      <tr>
        <td colSpan={7} className="px-5 py-3">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setGuardando(true);
              setError(null);
              const r = await actualizarCliente(cliente.id, new FormData(e.currentTarget));
              setGuardando(false);
              if (r.error) {
                setError(r.error);
                return;
              }
              setEditando(false);
              router.refresh();
            }}
            className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_2fr_auto]"
          >
            <input type="text" name="nombre" defaultValue={cliente.nombre} required className={claseInput} />
            <input type="text" name="telefono" defaultValue={cliente.telefono ?? ""} placeholder="Teléfono" className={claseInput} />
            <input type="number" name="dias_credito" defaultValue={cliente.dias_credito ?? ""} min={1} placeholder="Días crédito" className={claseInput} />
            <input type="text" name="notas" defaultValue={cliente.notas ?? ""} placeholder="Notas" className={claseInput} />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={guardando}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {guardando ? "..." : "Guardar"}
              </button>
              <button type="button" onClick={() => setEditando(false)} className="text-xs text-zinc-500 hover:text-zinc-900">
                Cancelar
              </button>
            </div>
            {error && <p className="text-xs text-red-600 sm:col-span-5">{error}</p>}
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="transition hover:bg-zinc-50">
      <td className="px-5 py-3">
        <p className="font-medium text-zinc-900">{cliente.nombre}</p>
        {cliente.notas && <p className="text-xs text-zinc-400">{cliente.notas}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </td>
      <td className="px-3 py-3 text-zinc-600">{cliente.telefono ?? "—"}</td>
      <td className="px-3 py-3 text-right text-zinc-600">{cliente.dias_credito ? `${cliente.dias_credito} días` : "—"}</td>
      <td className="px-3 py-3 text-right text-zinc-600">{ventas}</td>
      <td className="px-3 py-3 text-right text-zinc-700">{formatoPesos(comprado)}</td>
      <td className={`px-3 py-3 text-right ${saldo > 0.01 ? "font-medium text-amber-700" : "text-zinc-400"}`}>
        {saldo > 0.01 ? formatoPesos(saldo) : "—"}
      </td>
      <td className="px-5 py-3 text-right text-xs">
        <button type="button" onClick={() => setEditando(true)} className="text-zinc-500 hover:text-zinc-900">
          editar
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!window.confirm(`¿Quitar a ${cliente.nombre} de la lista de clientes?`)) return;
            const r = await eliminarCliente(cliente.id);
            if (r.error) {
              setError(r.error);
              return;
            }
            router.refresh();
          }}
          className="ml-3 text-zinc-400 hover:text-red-600"
        >
          quitar
        </button>
      </td>
    </tr>
  );
}

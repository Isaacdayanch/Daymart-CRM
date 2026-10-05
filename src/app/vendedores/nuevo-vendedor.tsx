"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoNumero } from "@/components/campo-numero";
import { crearVendedor } from "./actions";

const claseCampo = "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export function NuevoVendedor({ deshabilitado }: { deshabilitado?: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!abierto) {
    return (
      <button type="button" disabled={deshabilitado} onClick={() => setAbierto(true)} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50">
        + Nuevo vendedor
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        setError(null);
        const r = await crearVendedor(fd);
        if (r.error) setError(r.error);
        else router.push(`/vendedores/${r.id}`);
      }}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-zinc-500">Nombre</label>
        <input name="nombre" required autoFocus placeholder="Ej. Juan Pérez" className={claseCampo} />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500">Teléfono (opcional)</label>
        <input name="telefono" placeholder="55 1234 5678" className={claseCampo} />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500">Comisión (% del precio)</label>
        <CampoNumero name="comision_pct" defaultValue={10} className={claseCampo} />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500">Comisión fija por pieza (opcional)</label>
        <CampoNumero name="comision_fija" className={claseCampo} />
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <label className="block text-xs font-medium text-zinc-500">Notas (opcional)</label>
        <input name="notas" placeholder="De dónde lo conoces, zona, etc." className={claseCampo} />
      </div>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
        <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
          Crear vendedor y sus links
        </button>
        <button type="button" onClick={() => setAbierto(false)} className="text-xs text-zinc-500 hover:text-zinc-900">
          Cancelar
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </form>
  );
}

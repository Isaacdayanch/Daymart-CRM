"use client";

import { useState } from "react";
import { Selector } from "@/components/selector";
import { agregarPerfil } from "./actions";

export function FormularioAgregarPerfil() {
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  return (
    <form
      action={async (formData) => {
        setError(null);
        setExito(false);
        const resultado = await agregarPerfil(formData);
        if (resultado?.error) {
          setError(resultado.error);
        } else {
          setExito(true);
          (document.getElementById("form-agregar-perfil") as HTMLFormElement | null)?.reset();
        }
      }}
      id="form-agregar-perfil"
      className="grid gap-3 sm:grid-cols-[1fr_1fr_140px_auto] sm:items-end"
    >
      <div>
        <label className="block text-xs font-medium text-zinc-500">UUID del usuario (de Supabase)</label>
        <input
          type="text"
          name="id"
          required
          placeholder="Copiado de Authentication → Users"
          className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono focus:border-zinc-500 focus:ring-zinc-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500">Nombre</label>
        <input
          type="text"
          name="nombre"
          placeholder="Ej. María"
          className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500">Rol</label>
        <Selector
          name="rol"
          defaultValue="operadora"
          opciones={[
            { value: "operadora", label: "Operadora" },
            { value: "dueno", label: "Dueño" },
          ]}
        />
      </div>
      <button
        type="submit"
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
      >
        + Dar acceso
      </button>
      {error && <p className="text-sm text-red-600 sm:col-span-4">{error}</p>}
      {exito && <p className="text-sm text-emerald-600 sm:col-span-4">Acceso creado.</p>}
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Selector } from "@/components/selector";
import { agregarCuenta } from "../actions";

const TIPOS = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "BANCO", label: "Banco" },
  { value: "OTRO", label: "Otro" },
];

export function FormularioCuenta() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [version, setVersion] = useState(0);

  return (
    <form
      key={version}
      action={async (formData) => {
        setEnviando(true);
        setError(null);
        const resultado = await agregarCuenta(formData);
        setEnviando(false);
        if (resultado?.error) {
          setError(resultado.error);
        } else {
          setVersion((v) => v + 1);
          router.refresh();
        }
      }}
      className="mt-4 flex flex-wrap items-end gap-2"
    >
      <div className="flex-1">
        <label className="block text-xs font-medium text-zinc-500">Nombre</label>
        <input
          type="text"
          name="nombre"
          required
          placeholder="Ej. Banco Santander"
          className="mt-1 block w-full max-w-xs rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500">Tipo</label>
        <div className="mt-1">
          <Selector name="tipo" defaultValue="BANCO" opciones={TIPOS} />
        </div>
      </div>
      <label className="flex items-center gap-2 pb-2 text-xs font-medium text-zinc-600">
        <input type="checkbox" name="cuenta_transito" value="true" className="h-4 w-4 rounded border-zinc-300" />
        De tránsito (ej. Mercado Pago — no cuenta como saldo real)
      </label>
      <button
        type="submit"
        disabled={enviando}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50"
      >
        {enviando ? "Guardando..." : "Agregar"}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}

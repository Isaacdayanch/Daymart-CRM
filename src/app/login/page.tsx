"use client";

import { useState } from "react";
import { Logo } from "@/components/logo";
import { iniciarSesion } from "./actions";

export default function Login() {
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <form
          action={async (formData) => {
            setEnviando(true);
            setError(null);
            const resultado = await iniciarSesion(formData);
            if (resultado?.error) {
              setError(resultado.error);
              setEnviando(false);
            }
          }}
          className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="block text-xs font-medium text-zinc-500">Correo</label>
            <input
              type="email"
              name="correo"
              required
              autoComplete="email"
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Contraseña</label>
            <input
              type="password"
              name="contrasena"
              required
              autoComplete="current-password"
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 disabled:opacity-50"
          >
            {enviando ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

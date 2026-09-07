import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { obtenerPerfilActual } from "@/lib/perfil";
import { Logo } from "@/components/logo";
import type { Perfil } from "@/lib/tipos";
import { FilaPerfil } from "./fila-perfil";
import { FormularioAgregarPerfil } from "./formulario-agregar";

export default async function Usuarios() {
  const supabase = await createClient();
  const perfilActual = await obtenerPerfilActual();
  const { data: perfiles } = await supabase
    .from("perfiles")
    .select("*")
    .order("creado_en", { ascending: true })
    .returns<Perfil[]>();

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <Logo />
            <h1 className="mt-1 text-lg font-semibold text-zinc-900">Usuarios</h1>
          </div>
          <Link href="/" className="text-sm font-medium text-zinc-500 transition hover:text-zinc-900">
            ← Inicio
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-zinc-200 bg-amber-50/60 p-5 text-sm text-zinc-600">
          <p className="font-medium text-zinc-900">Cómo dar acceso a alguien nuevo:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>
              Entra a tu proyecto en{" "}
              <a
                href="https://supabase.com/dashboard/project/sytynlembvdqsddvatcg/auth/users"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Supabase → Authentication → Users
              </a>{" "}
              y dale &ldquo;Add user&rdquo; (correo + contraseña, marca &ldquo;Auto Confirm User&rdquo;).
            </li>
            <li>Dale clic a esa persona en la lista y copia su &ldquo;User UID&rdquo;.</li>
            <li>Pégalo aquí abajo, ponle nombre y su rol, y dale &ldquo;+ Dar acceso&rdquo;.</li>
          </ol>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Dar acceso nuevo</h2>
          <div className="mt-3">
            <FormularioAgregarPerfil />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Con acceso hoy</h2>
          <div className="mt-2 divide-y divide-zinc-100">
            {(perfiles ?? []).map((p) => (
              <FilaPerfil key={p.id} perfil={p} esUnoMismo={p.id === perfilActual?.id} />
            ))}
            {(!perfiles || perfiles.length === 0) && (
              <p className="py-3 text-sm text-zinc-400">Nadie más tiene acceso todavía.</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

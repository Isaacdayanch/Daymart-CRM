import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { BotonReclamar } from "./boton-reclamar";
import { cerrarSesion } from "../login/actions";

export default async function SinAcceso() {
  const supabase = await createClient();
  const { data: esPrimerUsuario } = await supabase.rpc("no_hay_duenos");

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex justify-center">
          <Logo />
        </div>
        {esPrimerUsuario ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-zinc-600">
              Todavía no hay ningún dueño registrado en el sistema. Como eres quien entra primero, puedes
              tomar ese rol ahora.
            </p>
            <div className="mt-4">
              <BotonReclamar />
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
            Tu cuenta todavía no tiene acceso asignado. Pídele a Isaac que te dé de alta desde
            &ldquo;Usuarios&rdquo;.
          </div>
        )}
        <form action={cerrarSesion}>
          <button type="submit" className="text-xs font-medium text-zinc-400 hover:text-zinc-700">
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}

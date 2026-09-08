import Link from "next/link";
import { NavFinanzas } from "./nav-finanzas";
import { Logo } from "@/components/logo";
import { cerrarSesion } from "../login/actions";

export default function FinanzasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between">
            <div>
              <Logo />
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">Finanzas</h1>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/" className="text-sm font-medium text-zinc-500 transition hover:text-zinc-900">
                ← Contenedores
              </Link>
              <form action={cerrarSesion}>
                <button type="submit" className="text-sm font-medium text-zinc-400 hover:text-zinc-900">
                  Cerrar sesión
                </button>
              </form>
            </div>
          </div>
          <div className="mt-4">
            <NavFinanzas />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

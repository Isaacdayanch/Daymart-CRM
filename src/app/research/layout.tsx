import { Logo } from "@/components/logo";
import { obtenerPerfilActual } from "@/lib/perfil";
import { MenuMas } from "../menu-mas";

export default async function ResearchLayout({ children }: { children: React.ReactNode }) {
  const perfil = await obtenerPerfilActual();

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
          <div>
            <Logo />
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">Research</h1>
          </div>
          <MenuMas rol={perfil?.rol} />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

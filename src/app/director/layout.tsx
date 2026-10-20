import { Logo } from "@/components/logo";
import { obtenerPerfilActual } from "@/lib/perfil";
import { MenuMas } from "../menu-mas";

/** Director de Mercado Libre (solo dueño): las propuestas del agente diario,
 * la aprobación de Isaac y la bitácora. */
export default async function DirectorLayout({ children }: { children: React.ReactNode }) {
  const perfil = await obtenerPerfilActual();
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur-sm print:hidden">
        <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between">
            <div>
              <Logo />
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">Director Meli</h1>
            </div>
            <MenuMas rol={perfil?.rol} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

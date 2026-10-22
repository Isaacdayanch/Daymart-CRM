import { Suspense } from "react";
import { NavVentas } from "./nav-ventas";
import { Logo } from "@/components/logo";
import { MenuSesion } from "../menu-sesion";
import { AvisosVentas } from "./avisos-ventas";

export default function VentasLayout({ children }: { children: React.ReactNode }) {

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur-sm print:hidden">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between">
            <div>
              <Logo />
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">Ventas</h1>
            </div>
            <MenuSesion />
          </div>
          <div className="mt-4">
            <NavVentas />
          </div>
        </div>
      </header>

      {/* Velocidad (20 oct): el aviso va en Suspense para no detener la pantalla. */}
      <Suspense fallback={null}>
        <AvisosVentas />
      </Suspense>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 print:px-0 print:py-0">{children}</main>
    </div>
  );
}

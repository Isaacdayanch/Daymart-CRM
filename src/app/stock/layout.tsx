import { NavStock } from "./nav-stock";
import { Logo } from "@/components/logo";
import { MenuSesion } from "../menu-sesion";
import { Suspense } from "react";
import { AvisoEnviosFull } from "./aviso-envios-full";

export default function StockLayout({ children }: { children: React.ReactNode }) {

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur-sm print:hidden">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between">
            <div>
              <Logo />
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">Stock</h1>
            </div>
            <MenuSesion />
          </div>
          <div className="mt-4">
            <NavStock />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 print:px-0 print:py-0">
        {/* Velocidad: el aviso consulta Mercado Libre; va en Suspense para que la pantalla no lo espere. */}
        <Suspense fallback={null}>
          <AvisoEnviosFull />
        </Suspense>
        {children}
      </main>
    </div>
  );
}

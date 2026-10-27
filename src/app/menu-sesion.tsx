import { Suspense } from "react";
import { obtenerPerfilActual } from "@/lib/perfil";
import { MenuMas } from "./menu-mas";

async function MenuConRol() {
  const perfil = await obtenerPerfilActual();
  return <MenuMas rol={perfil?.rol} />;
}

/** El menú ☰ de los encabezados. Velocidad (22 oct): el rol se consulta
 * dentro de un Suspense, así el layout de cada sección ya no espera esa
 * consulta para pintarse y la pantalla de carga aparece al instante. Mientras
 * llega, se ve el mismo ícono ☰ (todavía sin abrir). */
export function MenuSesion() {
  return (
    <Suspense fallback={<IconoMenu />}>
      <MenuConRol />
    </Suspense>
  );
}

function IconoMenu() {
  return (
    <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500">
      <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
        <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

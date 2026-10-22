"use client";

import { usePathname } from "next/navigation";

/** En Stock → Full y ML no se repite el aviso de envíos de arriba: la propia
 * pantalla ya lo muestra (Isaac, 21 oct: "quita todo eso de arriba"). */
export function OcultarEnFull({ children }: { children: React.ReactNode }) {
  return usePathname() === "/stock/full" ? null : <>{children}</>;
}

"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

/**
 * Renglón de tabla que abre un link al picarle en cualquier parte
 * (no solo en el número). Los links y botones que vayan adentro
 * siguen funcionando normal; Ctrl/Cmd + clic abre en pestaña nueva.
 */
export function FilaLink({ href, className = "", children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();

  function alPicar(e: MouseEvent<HTMLTableRowElement>) {
    const objetivo = e.target as HTMLElement | null;
    if (objetivo?.closest("a, button, input, select, textarea, label")) return;
    if (e.metaKey || e.ctrlKey) {
      window.open(href, "_blank", "noopener");
      return;
    }
    router.push(href);
  }

  return (
    <tr onClick={alPicar} className={`cursor-pointer ${className}`}>
      {children}
    </tr>
  );
}

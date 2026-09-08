// Wordmark de Daymart CRM. Antes llevaba un ícono de casita recreado a
// mano (Isaac pidió quitarlo y dejar solo el texto).

import Link from "next/link";

const AZUL = "#1467d6";

const ESTILOS = {
  sm: { texto: "text-base", badge: "text-[10px] px-1.5 py-0.5 rounded-md", gap: "gap-1.5" },
  md: { texto: "text-lg", badge: "text-[10px] px-1.5 py-0.5 rounded-md", gap: "gap-1.5" },
  lg: { texto: "text-4xl sm:text-5xl", badge: "text-xs sm:text-sm px-2 py-1 rounded-lg", gap: "gap-2.5" },
} as const;

export function Logo({ tamano = "md", href = "/" }: { tamano?: keyof typeof ESTILOS; href?: string }) {
  const estilo = ESTILOS[tamano];

  return (
    <Link href={href} className={`flex items-center ${estilo.gap}`}>
      <span
        className={`font-[family-name:var(--font-baloo)] ${estilo.texto} font-bold tracking-tight`}
        style={{ color: AZUL }}
      >
        Daymart
      </span>
      <span
        className={`font-[family-name:var(--font-baloo)] ${estilo.badge} font-semibold tracking-wide uppercase`}
        style={{ color: AZUL, backgroundColor: `${AZUL}1a` }}
      >
        CRM
      </span>
    </Link>
  );
}

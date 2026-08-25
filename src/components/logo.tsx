// Logo de Daymart: recreado en SVG a partir de la imagen que mandó Isaac
// (no llegó como archivo al ambiente, solo se pudo ver en el chat). Si más
// adelante hay un archivo original (SVG/PNG del diseñador), se puede
// cambiar aquí por el exacto.

const AZUL = "#1467d6";

export function Logo({ tamano = "md" }: { tamano?: "sm" | "md" }) {
  const icono = tamano === "sm" ? 22 : 26;
  const texto = tamano === "sm" ? "text-base" : "text-lg";

  return (
    <div className="flex items-center gap-1.5">
      <svg width={icono} height={icono} viewBox="0 0 48 48" fill="none" aria-hidden>
        <path
          d="M14 40 V20 L24 8 L34 20 V34"
          stroke={AZUL}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={`font-[family-name:var(--font-baloo)] ${texto} font-bold tracking-tight`} style={{ color: AZUL }}>
        Daymart
      </span>
      <span
        className="font-[family-name:var(--font-baloo)] rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
        style={{ color: AZUL, backgroundColor: `${AZUL}1a` }}
      >
        CRM
      </span>
    </div>
  );
}

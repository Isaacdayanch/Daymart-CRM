// Wordmark de Daymart CRM. Antes llevaba un ícono de casita recreado a
// mano (Isaac pidió quitarlo y dejar solo el texto).

const AZUL = "#1467d6";

export function Logo({ tamano = "md" }: { tamano?: "sm" | "md" }) {
  const texto = tamano === "sm" ? "text-base" : "text-lg";

  return (
    <div className="flex items-center gap-1.5">
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

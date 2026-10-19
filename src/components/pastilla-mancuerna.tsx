import { etiquetaMancuerna, type CamposMancuerna } from "@/lib/mancuernas";

/** Pastilla "mancuerna · 15 lb (6.8 kg) · por par" para listas y tarjetas.
 * No pinta nada si el producto no es mancuerna. */
export function PastillaMancuerna({ producto, className = "" }: { producto: CamposMancuerna | null | undefined; className?: string }) {
  const texto = etiquetaMancuerna(producto);
  if (!texto) return null;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 ring-1 ring-inset ring-sky-200 ${className}`}>
      <span aria-hidden>🏋️</span>
      {texto}
    </span>
  );
}

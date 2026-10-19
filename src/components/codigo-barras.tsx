import { barrasCode128, sePuedeCodificar } from "@/lib/codigo-barras";

/** Código de barras Code 128 como SVG. Se estira al ancho que le den (todas
 * las barras escalan parejo, así que las proporciones se conservan y sigue
 * siendo legible por el escáner); la altura la manda `altoMm`. */
export function CodigoBarras({ texto, altoMm = 10, className = "" }: { texto: string; altoMm?: number; className?: string }) {
  if (!sePuedeCodificar(texto)) return null;
  const { barras, anchoTotal } = barrasCode128(texto);
  return (
    <svg
      viewBox={`0 0 ${anchoTotal} 100`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      style={{ width: "100%", height: `${altoMm}mm`, display: "block" }}
      className={className}
      aria-label={`Código de barras ${texto}`}
      role="img"
    >
      {barras.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.ancho} height={100} fill="#000" />
      ))}
    </svg>
  );
}

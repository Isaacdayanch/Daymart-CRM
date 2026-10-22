import Image from "next/image";

// Mismo host que `images.remotePatterns` en next.config.ts.
const FOTOS_PROPIAS = "https://sytynlembvdqsddvatcg.supabase.co/storage/v1/object/public/";

/** Foto chiquita de un producto en tablas y listas.
 *
 * Velocidad (22 oct): las fotos se suben tal cual salen del celular (varios
 * MB cada una) y la tabla de Stock las bajaba COMPLETAS para mostrarlas a
 * 40 px — cientos de MB con muchos productos. Las fotos del bucket propio
 * pasan por el optimizador de imágenes (se piden del tamaño en que se ven,
 * ~5–10 KB, y quedan guardadas); las de Mercado Libre ya vienen chiquitas.
 * Todas cargan solo cuando aparecen en pantalla (`loading="lazy"`). */
export function Miniatura({ src, alt = "", tamano, className = "" }: { src: string; alt?: string; tamano: number; className?: string }) {
  if (src.startsWith(FOTOS_PROPIAS)) {
    return <Image src={src} alt={alt} width={tamano} height={tamano} sizes={`${tamano}px`} className={className} />;
  }
  // eslint-disable-next-line @next/next/no-img-element -- foto externa (Mercado Libre), ya viene en miniatura
  return <img src={src} alt={alt} loading="lazy" decoding="async" className={className} />;
}

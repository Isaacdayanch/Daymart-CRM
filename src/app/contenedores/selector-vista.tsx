import Link from "next/link";

/** Cambia entre la lista de contenedores ("Vista general") y todos los
 * productos que vienen en camino ("Vista de productos"). */
export function SelectorVistaContenedores({ actual }: { actual: "general" | "productos" }) {
  const clase = (activa: boolean) =>
    `px-3 py-1 text-xs font-medium transition ${activa ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:text-zinc-900"}`;
  return (
    <div className="flex overflow-hidden rounded-lg border border-zinc-300">
      <Link href="/contenedores" className={clase(actual === "general")}>
        Vista general
      </Link>
      <Link href="/contenedores/productos" className={clase(actual === "productos")}>
        Vista de productos
      </Link>
    </div>
  );
}

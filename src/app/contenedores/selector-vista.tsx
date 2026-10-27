import Link from "next/link";

/** Cambia entre la lista de contenedores ("Vista general"), todos los
 * productos que vienen en camino ("Vista de productos") y el Planeador
 * (mover productos entre contenedores que se están configurando; solo
 * dueño, por eso `conPlaneador`). */
export function SelectorVistaContenedores({ actual, conPlaneador = false }: { actual: "general" | "productos" | "planeador"; conPlaneador?: boolean }) {
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
      {conPlaneador && (
        <Link href="/contenedores/planeador" className={clase(actual === "planeador")}>
          Planeador
        </Link>
      )}
    </div>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { costoPorCbmContenedor, tipoCambioPromedioMercancia } from "@/lib/calculos";
import { obtenerPerfilActual } from "@/lib/perfil";
import { Logo } from "@/components/logo";
import { MenuMas } from "../../menu-mas";
import { SelectorVistaContenedores } from "../selector-vista";
import type { Contenedor, PagoMercancia, Producto } from "@/lib/tipos";
import { VistaProductos } from "./vista-productos";

/** Todos los contenedores vistos por PRODUCTO (no por contenedor), del más
 * nuevo al más viejo: la misma vista "de un guamazo" que Isaac tenía en su
 * hoja de Sheets. Con ?encamino=1 se filtra a solo lo que todavía no llega
 * a bodega. */
export default async function ProductosEnCamino({
  searchParams,
}: {
  searchParams: Promise<{ encamino?: string }>;
}) {
  const { encamino } = await searchParams;
  const soloEnCamino = encamino === "1";
  const supabase = await createClient();
  const perfil = await obtenerPerfilActual();
  const verDinero = perfil?.rol !== "operadora";

  const [{ data: contenedores }, { data: productos }, { data: pagos }] = await Promise.all([
    supabase
      .from("contenedores")
      .select("*")
      .is("eliminado_en", null)
      .order("numero", { ascending: false })
      .returns<Contenedor[]>(),
    supabase.from("productos").select("*").order("orden", { ascending: true }).returns<Producto[]>(),
    supabase.from("pagos_mercancia").select("*").returns<PagoMercancia[]>(),
  ]);

  const visibles = (contenedores ?? []).filter((c) => !soloEnCamino || c.estado !== "RECIBIDO_BODEGA");

  const grupos = visibles.map((contenedor) => {
    const suyos = (productos ?? []).filter((p) => p.contenedor_id === contenedor.id);
    const abonos = (pagos ?? []).filter((p) => p.contenedor_id === contenedor.id);
    return {
      contenedor,
      productos: suyos,
      costoPorCbm: costoPorCbmContenedor(contenedor, suyos),
      tipoCambioMercancia: tipoCambioPromedioMercancia(abonos),
    };
  });

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Logo />
          <MenuMas rol={perfil?.rol} />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Contenedores</h1>
            <SelectorVistaContenedores actual="productos" />
          </div>
          <Link
            href={soloEnCamino ? "/contenedores/productos" : "/contenedores/productos?encamino=1"}
            className="text-xs font-medium text-zinc-500 hover:text-zinc-900"
          >
            {soloEnCamino ? "Ver todos los contenedores" : "Ver solo lo que viene en camino"}
          </Link>
        </div>

        <VistaProductos grupos={grupos} verDinero={verDinero} />
      </main>
    </div>
  );
}

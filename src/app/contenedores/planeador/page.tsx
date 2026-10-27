import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { obtenerPerfilActual } from "@/lib/perfil";
import { armarColumna } from "@/lib/planeador";
import { Logo } from "@/components/logo";
import { MenuMas } from "../../menu-mas";
import { SelectorVistaContenedores } from "../selector-vista";
import type { Contenedor, PagoMercancia, Producto, TrasladoProducto } from "@/lib/tipos";
import { Planeador } from "./planeador";

export const dynamic = "force-dynamic";

/** Planeador: una columna por contenedor que todavía se está configurando,
 * con sus barras de espacio y peso, para pasar productos de uno a otro
 * (arrastrando o con "Mover a…") y crear el siguiente contenedor. Isaac
 * (26 oct): "meterle mucho más de 70 CBM al 16 y luego empezar a asignarlos
 * por contenedor… armar el 17 y el 18 según el peso y la urgencia". */
export default async function PaginaPlaneador() {
  const supabase = await createClient();
  const [perfil, { data: contenedores }, { data: productos }, { data: pagos }, traslados] = await Promise.all([
    obtenerPerfilActual(),
    supabase
      .from("contenedores")
      .select("*")
      .is("eliminado_en", null)
      .eq("estado", "CONFIGURANDOSE")
      .order("numero", { ascending: true })
      .returns<Contenedor[]>(),
    supabase.from("productos").select("*").order("orden", { ascending: true }).returns<Producto[]>(),
    supabase.from("pagos_mercancia").select("*").returns<PagoMercancia[]>(),
    supabase.from("traslados_producto").select("*").order("creado_en", { ascending: false }).limit(30).returns<TrasladoProducto[]>(),
  ]);
  const verDinero = perfil?.rol !== "operadora";
  const faltaSql = Boolean(traslados.error && /does not exist|schema cache|Could not find/i.test(traslados.error.message));

  const columnas = (contenedores ?? []).map((c) => armarColumna(c, productos ?? [], pagos ?? []));

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <Logo />
          <MenuMas rol={perfil?.rol} />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Contenedores</h1>
            <SelectorVistaContenedores actual="planeador" conPlaneador={verDinero} />
          </div>
          <Link href="/contenedores/nuevo" className="text-xs font-medium text-zinc-500 hover:text-zinc-900">
            Nuevo contenedor desde cero →
          </Link>
        </div>

        {faltaSql && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
            Falta correr el SQL <span className="font-semibold">0059</span> en Supabase: mientras, se pueden mover productos y crear contenedores, pero no se guarda la
            urgencia ni el historial de traslados.
          </div>
        )}

        <Planeador columnas={columnas} traslados={traslados.data ?? []} verDinero={verDinero} />
      </main>
    </div>
  );
}

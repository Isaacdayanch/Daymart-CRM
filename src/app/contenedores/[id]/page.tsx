import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  cbmTotalContenedor,
  costoPorCbmContenedor,
  costoTotalContenedor,
  tipoCambioPromedioMercancia,
} from "@/lib/calculos";
import { formatoPesos, ESTILO_ESTADO } from "@/lib/formato";
import { ESTADOS_CONTENEDOR, type Contenedor, type PagoMercancia, type Producto } from "@/lib/tipos";
import { FormularioContenedor } from "./formulario-contenedor";
import { Abonos } from "./abonos";
import { Productos } from "./productos";

export default async function DetalleContenedor({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: contenedor } = await supabase
    .from("contenedores")
    .select("*")
    .eq("id", id)
    .single<Contenedor>();

  if (!contenedor) notFound();

  const [{ data: abonos }, { data: productos }] = await Promise.all([
    supabase
      .from("pagos_mercancia")
      .select("*")
      .eq("contenedor_id", id)
      .returns<PagoMercancia[]>(),
    supabase.from("productos").select("*").eq("contenedor_id", id).returns<Producto[]>(),
  ]);

  const listaAbonos = abonos ?? [];
  const listaProductos = productos ?? [];

  const cbmTotal = cbmTotalContenedor(listaProductos);
  const costoPorCbm = costoPorCbmContenedor(contenedor, listaProductos);
  const tipoCambioMercancia = tipoCambioPromedioMercancia(listaAbonos);
  const costoTotal = costoTotalContenedor(contenedor, listaAbonos);
  const etiquetaEstado =
    ESTADOS_CONTENEDOR.find((e) => e.valor === contenedor.estado)?.etiqueta ?? contenedor.estado;

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Daymart</p>
            <h1 className="text-lg font-semibold text-zinc-900">Contenedor {contenedor.numero}</h1>
          </div>
          <Link href="/" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
            ← Volver a la lista
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">Estado</p>
            <span
              className={`mt-1 inline-block rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${ESTILO_ESTADO[contenedor.estado]}`}
            >
              {etiquetaEstado}
            </span>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">CBM total</p>
            <p className="mt-1 text-sm font-semibold text-zinc-900">{cbmTotal.toFixed(2)} m³</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">Costo por CBM</p>
            <p className="mt-1 text-sm font-semibold text-zinc-900">{formatoPesos(costoPorCbm)}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">Costo total contenedor</p>
            <p className="mt-1 text-sm font-semibold text-zinc-900">{formatoPesos(costoTotal)}</p>
          </div>
        </div>

        <FormularioContenedor contenedor={contenedor} />
        <Abonos contenedorId={contenedor.id} abonos={listaAbonos} />
        <Productos
          contenedorId={contenedor.id}
          productos={listaProductos}
          costoPorCbm={costoPorCbm}
          tipoCambioMercancia={tipoCambioMercancia}
        />
      </main>
    </div>
  );
}

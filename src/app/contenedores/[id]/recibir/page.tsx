import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Bodega, Contenedor, Producto } from "@/lib/tipos";
import { FormularioRecepcion } from "./formulario-recepcion";

export default async function RecibirContenedor({
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

  const [{ data: productos }, { data: bodegas }] = await Promise.all([
    supabase
      .from("productos")
      .select("*")
      .eq("contenedor_id", id)
      .order("orden", { ascending: true })
      .returns<Producto[]>(),
    supabase.from("bodegas").select("*").is("eliminado_en", null).order("nombre").returns<Bodega[]>(),
  ]);

  const listaProductos = productos ?? [];
  const listaBodegas = bodegas ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <header className="border-b border-zinc-200/70 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
          <div>
            <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Daymart · Stock</p>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
              Recibir contenedor {contenedor.numero}
            </h1>
          </div>
          <Link
            href={`/contenedores/${id}`}
            className="text-sm font-medium text-zinc-500 transition hover:text-zinc-900"
          >
            ← Cancelar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {contenedor.stock_generado_en ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-800">
            Este contenedor ya se recibió a stock. Si necesitas hacer un ajuste, ve a{" "}
            <Link href="/stock/movimientos" className="font-medium underline">
              el libro de movimientos
            </Link>
            .
          </div>
        ) : listaProductos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
            Este contenedor no tiene productos capturados todavía.
          </div>
        ) : listaBodegas.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
            Necesitas al menos una bodega antes de recibir. Ve a{" "}
            <Link href="/stock/bodegas" className="font-medium underline">
              Bodegas
            </Link>{" "}
            y agrega una.
          </div>
        ) : (
          <>
            <p className="mb-6 text-sm leading-relaxed text-zinc-500">
              Confirma cuánto llegó realmente de cada producto. Si algo se quedó en China, ajusta la
              cantidad y cuéntanos qué pasó — queda guardado como pendiente para tu siguiente pedido.
            </p>
            <FormularioRecepcion contenedorId={id} productos={listaProductos} bodegas={listaBodegas} />
          </>
        )}
      </main>
    </div>
  );
}

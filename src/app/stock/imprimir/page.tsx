import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resumenPorSku } from "@/lib/calculos-stock";
import { formatoCajas, formatoFecha } from "@/lib/formato";
import { obtenerCategoriaPorSku, obtenerPiezasPorCajaPorSku } from "@/lib/productos-stock";
import type { ConfiguracionStock, MovimientoStock } from "@/lib/tipos";
import { BotonImprimir } from "../../contenedores/[id]/imprimir/boton-imprimir";
import { Logo } from "@/components/logo";

/** Hoja de revisión de inventario, en dos versiones:
 *  - Con cantidades del sistema (para que Isaac compare en la oficina).
 *  - Sin cantidades (`?sin=1`): para la gente de bodega — solo foto, SKU y
 *    producto, con columnas en blanco para que ELLOS anoten cuántas piezas
 *    contaron y notas (ej. "81 piezas, 3 de merma"). Así no ven el número
 *    del sistema y el conteo es a ciegas; Isaac hace el match después. */
export default async function ImprimirInventario({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; sin?: string }>;
}) {
  const { categoria, sin } = await searchParams;
  const sinCantidades = sin === "1";
  const supabase = await createClient();
  const [{ data: movimientos }, { data: configuracion }, piezasPorCajaPorSku, categoriaPorSku] = await Promise.all([
    supabase.from("movimientos_stock").select("*").returns<MovimientoStock[]>(),
    supabase.from("configuracion_stock").select("*").single<ConfiguracionStock>(),
    obtenerPiezasPorCajaPorSku(supabase),
    obtenerCategoriaPorSku(supabase),
  ]);

  const resumenes = resumenPorSku(movimientos ?? [], configuracion?.dias_espera ?? 60, piezasPorCajaPorSku, categoriaPorSku)
    .filter((r) => r.stockActual !== 0)
    .filter((r) => !categoria || r.categoria === categoria);

  const hrefCon = `/stock/imprimir${categoria ? `?categoria=${encodeURIComponent(categoria)}` : ""}`;
  const hrefSin = `/stock/imprimir?sin=1${categoria ? `&categoria=${encodeURIComponent(categoria)}` : ""}`;

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-4xl px-4 py-6 print:hidden sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex overflow-hidden rounded-xl border border-zinc-300 text-xs">
            <Link href={hrefCon} className={`px-3.5 py-2 ${!sinCantidades ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:text-zinc-900"}`}>
              Con cantidades del sistema
            </Link>
            <Link href={hrefSin} className={`px-3.5 py-2 ${sinCantidades ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:text-zinc-900"}`}>
              Sin cantidades (para bodega)
            </Link>
          </div>
          <BotonImprimir />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          {sinCantidades
            ? "Esta versión no muestra lo que dice el sistema: tu gente de bodega anota cuántas piezas contó y sus notas (merma, dañado, etc.), y tú haces el match en la oficina."
            : "Esta versión muestra las piezas y cajas según el sistema, para comparar contra el conteo físico."}
        </p>
      </div>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 print:px-0 print:py-0">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <Logo />
            <h1 className="mt-1 text-xl font-semibold text-zinc-900">{sinCantidades ? "Hoja de conteo de inventario" : "Hoja de revisión de inventario"}</h1>
            {categoria && <p className="text-sm text-zinc-500">Categoría: {categoria}</p>}
          </div>
          <div className="text-right text-sm text-zinc-500">
            <p>{formatoFecha(new Date().toISOString())}</p>
            {sinCantidades && (
              <p className="mt-3 text-xs text-zinc-600">
                Contó: ____________________
              </p>
            )}
          </div>
        </div>

        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b-2 border-zinc-900 text-zinc-500">
              <th className="py-2 pr-2 font-medium">✓</th>
              <th className="py-2 pr-2 font-medium">Foto</th>
              <th className="py-2 pr-2 font-medium">SKU</th>
              <th className="py-2 pr-2 font-medium">Producto</th>
              {!sinCantidades && (
                <>
                  <th className="py-2 pr-2 font-medium text-right">Piezas (sistema)</th>
                  <th className="py-2 pr-2 font-medium text-right">Cajas (sistema)</th>
                </>
              )}
              <th className={`py-2 pr-2 font-medium ${sinCantidades ? "w-28" : "text-right"}`}>{sinCantidades ? "Piezas contadas" : "Conteo físico"}</th>
              <th className={`py-2 pr-2 font-medium ${sinCantidades ? "w-56" : ""}`}>{sinCantidades ? "Notas (merma, dañado, cajas abiertas…)" : "Notas"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {resumenes.map((r) => (
              <tr key={r.sku}>
                <td className="py-2 pr-2">
                  <div className="h-4 w-4 border border-zinc-900" />
                </td>
                <td className="py-2 pr-2">
                  {r.imagenUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- se imprime/exporta a PDF, next/image no aplica
                    <img src={r.imagenUrl} alt={r.nombre} className={`rounded object-cover ${sinCantidades ? "h-12 w-12" : "h-10 w-10"}`} />
                  ) : (
                    <div className={`rounded bg-zinc-100 ${sinCantidades ? "h-12 w-12" : "h-10 w-10"}`} />
                  )}
                </td>
                <td className="py-2.5 pr-2 font-mono">{r.sku}</td>
                <td className="py-2.5 pr-2">{r.nombre}</td>
                {!sinCantidades && (
                  <>
                    <td className="py-2.5 pr-2 text-right font-medium">{r.stockActual}</td>
                    <td className="py-2.5 pr-2 text-right text-zinc-500">{r.cajas > 0 ? formatoCajas(r.cajas) : "—"}</td>
                  </>
                )}
                <td className={`border-b border-zinc-200 py-2.5 pr-2 ${sinCantidades ? "border-l border-zinc-200" : ""}`}></td>
                <td className={`border-b border-zinc-200 py-2.5 pr-2 ${sinCantidades ? "border-l border-zinc-200" : ""}`}></td>
              </tr>
            ))}
          </tbody>
        </table>
        {sinCantidades && (
          <p className="mt-4 text-[11px] text-zinc-500">
            Anota en “Piezas contadas” cuántas piezas buenas hay en total de ese producto. En “Notas” pon lo que no cuadre: merma, dañadas, cajas incompletas.
          </p>
        )}
      </main>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { resumenPorSku } from "@/lib/calculos-stock";
import { formatoFecha } from "@/lib/formato";
import type { ConfiguracionStock, MovimientoStock } from "@/lib/tipos";
import { BotonImprimir } from "../../contenedores/[id]/imprimir/boton-imprimir";
import { Logo } from "@/components/logo";

export default async function ImprimirInventario() {
  const supabase = await createClient();
  const [{ data: movimientos }, { data: configuracion }] = await Promise.all([
    supabase.from("movimientos_stock").select("*").returns<MovimientoStock[]>(),
    supabase.from("configuracion_stock").select("*").single<ConfiguracionStock>(),
  ]);

  const resumenes = resumenPorSku(movimientos ?? [], configuracion?.dias_espera ?? 60).filter(
    (r) => r.stockActual !== 0,
  );

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-4xl px-4 py-6 print:hidden sm:px-6">
        <div className="flex items-center justify-end">
          <BotonImprimir />
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 print:px-0 print:py-0">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <Logo />
            <h1 className="mt-1 text-xl font-semibold text-zinc-900">Hoja de revisión de inventario</h1>
          </div>
          <p className="text-sm text-zinc-500">{formatoFecha(new Date().toISOString())}</p>
        </div>

        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b-2 border-zinc-900 text-zinc-500">
              <th className="py-2 pr-2 font-medium">Foto</th>
              <th className="py-2 pr-2 font-medium">SKU</th>
              <th className="py-2 pr-2 font-medium">Producto</th>
              <th className="py-2 pr-2 font-medium text-right">Piezas (sistema)</th>
              <th className="py-2 pr-2 font-medium text-right">Cajas (sistema)</th>
              <th className="py-2 pr-2 font-medium text-right">Conteo físico</th>
              <th className="py-2 pr-2 font-medium">Notas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {resumenes.map((r) => (
              <tr key={r.sku}>
                <td className="py-2 pr-2">
                  {r.imagenUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- se imprime/exporta a PDF, next/image no aplica
                    <img src={r.imagenUrl} alt={r.nombre} className="h-10 w-10 rounded object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded bg-zinc-100" />
                  )}
                </td>
                <td className="py-2.5 pr-2 font-mono">{r.sku}</td>
                <td className="py-2.5 pr-2">{r.nombre}</td>
                <td className="py-2.5 pr-2 text-right font-medium">{r.stockActual}</td>
                <td className="py-2.5 pr-2 text-right text-zinc-500">{r.cajas > 0 ? r.cajas.toFixed(1) : "—"}</td>
                <td className="border-b border-zinc-200 py-2.5 pr-2"></td>
                <td className="border-b border-zinc-200 py-2.5 pr-2"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </div>
  );
}

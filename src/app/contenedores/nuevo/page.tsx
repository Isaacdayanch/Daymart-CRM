import Link from "next/link";
import { crearContenedor } from "./actions";
import { AbonosMercancia } from "./abonos-mercancia";
import { CampoNumero } from "@/components/campo-numero";
import { Selector } from "@/components/selector";
import { CamposProveedorPrincipal } from "@/components/campos-proveedor-principal";
import { createClient } from "@/lib/supabase/server";
import { obtenerSugerenciasCatalogo } from "@/lib/catalogo-proveedores";
import { ESTADOS_CONTENEDOR } from "@/lib/tipos";
import { Logo } from "@/components/logo";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export default async function NuevoContenedor({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { fabricas, proveedores } = await obtenerSugerenciasCatalogo(supabase);

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <Logo />
            <h1 className="mt-1 text-lg font-semibold text-zinc-900">Nuevo contenedor</h1>
          </div>
          <Link href="/" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
            Cancelar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            No se pudo guardar: {error}
          </div>
        )}

        <form action={crearContenedor} className="space-y-6 rounded-xl border border-zinc-200 bg-white p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="numero" className="block text-sm font-medium text-zinc-700">
                Número de contenedor
              </label>
              <input
                type="number"
                id="numero"
                name="numero"
                required
                min={1}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Estado</label>
              <div className="mt-1">
                <Selector
                  name="estado"
                  defaultValue="CONFIGURANDOSE"
                  opciones={ESTADOS_CONTENEDOR.map((e) => ({ value: e.valor, label: e.etiqueta }))}
                />
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="booking" className="block text-sm font-medium text-zinc-700">
              Booking
            </label>
            <input
              type="text"
              id="booking"
              name="booking"
              placeholder="Ej. MRKU2892234"
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
            />
          </div>

          <div className="border-t border-zinc-100 pt-4">
            <p className="text-sm font-medium text-zinc-700">Proveedor principal</p>
            <p className="text-xs text-zinc-500">
              Se usa para rellenar cada producto nuevo automáticamente. Si el contenedor es
              consolidado (varios proveedores), lo puedes cambiar por producto.
            </p>
            <CamposProveedorPrincipal fabricas={fabricas} proveedores={proveedores} />
          </div>

          <div className="border-t border-zinc-100 pt-4">
            <p className="text-sm font-medium text-zinc-700">Flete (dólares)</p>
            <p className="text-xs text-zinc-500">Se paga de una sola vez, con su propio tipo de cambio.</p>
            <div className="mt-2 grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="flete_dolares" className="block text-xs font-medium text-zinc-500">
                  Monto USD
                </label>
                <CampoNumero id="flete_dolares" name="flete_dolares" className={claseCampo} />
              </div>
              <div>
                <label htmlFor="flete_tipo_cambio" className="block text-xs font-medium text-zinc-500">
                  Tipo de cambio
                </label>
                <CampoNumero id="flete_tipo_cambio" name="flete_tipo_cambio" className={claseCampo} />
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-100 pt-4">
            <label htmlFor="aduana_pesos" className="block text-sm font-medium text-zinc-700">
              Aduana (pesos)
            </label>
            <CampoNumero id="aduana_pesos" name="aduana_pesos" className={`${claseCampo} w-40`} />
          </div>

          <details className="border-t border-zinc-100 pt-4">
            <summary className="cursor-pointer text-sm font-medium text-zinc-700">
              + Otros gastos (opcional)
            </summary>
            <p className="mt-1 text-xs text-zinc-500">
              Para fletes internos en China u otros cargos que no siempre aplican.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="otros_gastos_dolares" className="block text-xs font-medium text-zinc-500">
                  Monto USD
                </label>
                <CampoNumero id="otros_gastos_dolares" name="otros_gastos_dolares" className={claseCampo} />
              </div>
              <div>
                <label htmlFor="otros_gastos_tipo_cambio" className="block text-xs font-medium text-zinc-500">
                  Tipo de cambio
                </label>
                <CampoNumero
                  id="otros_gastos_tipo_cambio"
                  name="otros_gastos_tipo_cambio"
                  className={claseCampo}
                />
              </div>
            </div>
          </details>

          <div className="border-t border-zinc-100 pt-4">
            <AbonosMercancia />
          </div>

          <div className="flex justify-end gap-3 border-t border-zinc-100 pt-4">
            <Link
              href="/"
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Guardar contenedor
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

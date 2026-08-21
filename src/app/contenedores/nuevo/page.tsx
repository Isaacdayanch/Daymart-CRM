import Link from "next/link";
import { crearContenedor } from "./actions";
import { ESTADOS_CONTENEDOR } from "@/lib/tipos";

export default async function NuevoContenedor({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Daymart</p>
            <h1 className="text-lg font-semibold text-zinc-900">Nuevo contenedor</h1>
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
              <label htmlFor="estado" className="block text-sm font-medium text-zinc-700">
                Estado
              </label>
              <select
                id="estado"
                name="estado"
                defaultValue="EN_TRANSITO"
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
              >
                {ESTADOS_CONTENEDOR.map((e) => (
                  <option key={e.valor} value={e.valor}>
                    {e.etiqueta}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="barco" className="block text-sm font-medium text-zinc-700">
                Barco
              </label>
              <input
                type="text"
                id="barco"
                name="barco"
                placeholder="Ej. MSC Katrina"
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
              />
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
          </div>

          <div>
            <p className="text-sm font-medium text-zinc-700">Gastos del contenedor (pesos)</p>
            <p className="text-xs text-zinc-500">
              Flete y aduana se reparten entre los productos según su CBM. Mercancía es solo informativo.
            </p>
            <div className="mt-2 grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="flete" className="block text-xs font-medium text-zinc-500">
                  Flete
                </label>
                <input
                  type="number"
                  id="flete"
                  name="flete"
                  step="0.01"
                  min={0}
                  defaultValue={0}
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
                />
              </div>
              <div>
                <label htmlFor="aduana" className="block text-xs font-medium text-zinc-500">
                  Aduana
                </label>
                <input
                  type="number"
                  id="aduana"
                  name="aduana"
                  step="0.01"
                  min={0}
                  defaultValue={0}
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
                />
              </div>
              <div>
                <label htmlFor="mercancia" className="block text-xs font-medium text-zinc-500">
                  Mercancía
                </label>
                <input
                  type="number"
                  id="mercancia"
                  name="mercancia"
                  step="0.01"
                  min={0}
                  defaultValue={0}
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
                />
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="tipo_cambio" className="block text-sm font-medium text-zinc-700">
              Tipo de cambio del dólar
            </label>
            <input
              type="number"
              id="tipo_cambio"
              name="tipo_cambio"
              step="0.01"
              min={0}
              placeholder="Ej. 18.5"
              required
              className="mt-1 block w-40 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
            />
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

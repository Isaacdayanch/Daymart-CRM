"use client";

import { CampoNumero } from "@/components/campo-numero";
import { ESTADOS_CONTENEDOR, type Contenedor } from "@/lib/tipos";
import { actualizarContenedor, eliminarContenedor } from "./actions";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export function FormularioContenedor({ contenedor }: { contenedor: Contenedor }) {
  const guardar = actualizarContenedor.bind(null, contenedor.id);

  return (
    <form action={guardar} className="space-y-6 rounded-xl border border-zinc-200 bg-white p-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="booking" className="block text-sm font-medium text-zinc-700">
            Booking
          </label>
          <input
            type="text"
            id="booking"
            name="booking"
            defaultValue={contenedor.booking ?? ""}
            placeholder="Ej. MRKU2892234"
            className={claseCampo}
          />
        </div>
        <div>
          <label htmlFor="estado" className="block text-sm font-medium text-zinc-700">
            Estado
          </label>
          <select
            id="estado"
            name="estado"
            defaultValue={contenedor.estado}
            className={claseCampo}
          >
            {ESTADOS_CONTENEDOR.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.etiqueta}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="border-t border-zinc-100 pt-4">
        <p className="text-sm font-medium text-zinc-700">Flete (dólares)</p>
        <div className="mt-2 grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="flete_dolares" className="block text-xs font-medium text-zinc-500">
              Monto USD
            </label>
            <CampoNumero
              id="flete_dolares"
              name="flete_dolares"
              defaultValue={contenedor.flete_dolares}
              className={claseCampo}
            />
          </div>
          <div>
            <label htmlFor="flete_tipo_cambio" className="block text-xs font-medium text-zinc-500">
              Tipo de cambio
            </label>
            <CampoNumero
              id="flete_tipo_cambio"
              name="flete_tipo_cambio"
              defaultValue={contenedor.flete_tipo_cambio}
              className={claseCampo}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-100 pt-4">
        <label htmlFor="aduana_pesos" className="block text-sm font-medium text-zinc-700">
          Aduana (pesos)
        </label>
        <CampoNumero
          id="aduana_pesos"
          name="aduana_pesos"
          defaultValue={contenedor.aduana_pesos}
          className={`${claseCampo} w-40`}
        />
      </div>

      <div className="flex items-center justify-between border-t border-zinc-100 pt-4">
        <button
          type="button"
          onClick={() => {
            if (confirm(`¿Seguro que quieres borrar el contenedor ${contenedor.numero}? Esto borra también sus productos y abonos.`)) {
              eliminarContenedor(contenedor.id);
            }
          }}
          className="text-sm font-medium text-red-600 hover:text-red-800"
        >
          Borrar contenedor
        </button>
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Guardar cambios
        </button>
      </div>
    </form>
  );
}

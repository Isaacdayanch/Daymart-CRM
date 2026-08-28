"use client";

import { CampoNumero } from "@/components/campo-numero";
import { Selector } from "@/components/selector";
import { CamposProveedorPrincipal } from "@/components/campos-proveedor-principal";
import { ESTADOS_CONTENEDOR, type Contenedor } from "@/lib/tipos";
import { actualizarContenedor, eliminarContenedor } from "./actions";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export function FormularioContenedor({
  contenedor,
  fabricas,
  proveedores,
}: {
  contenedor: Contenedor;
  fabricas: string[];
  proveedores: string[];
}) {
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
          <label className="block text-sm font-medium text-zinc-700">Estado</label>
          <div className="mt-1">
            <Selector
              name="estado"
              defaultValue={contenedor.estado}
              opciones={ESTADOS_CONTENEDOR.map((e) => ({ value: e.valor, label: e.etiqueta }))}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-100 pt-4">
        <p className="text-sm font-medium text-zinc-700">Proveedor principal</p>
        <p className="text-xs text-zinc-500">
          Se usa para rellenar cada producto nuevo automáticamente. Si el contenedor es
          consolidado (varios proveedores), lo puedes cambiar por producto.
        </p>
        <CamposProveedorPrincipal
          fabricas={fabricas}
          proveedores={proveedores}
          fabricaInicial={contenedor.fabrica_principal}
          proveedorInicial={contenedor.proveedor_principal}
        />
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

      <details
        className="border-t border-zinc-100 pt-4"
        open={contenedor.otros_gastos_dolares > 0}
      >
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
            <CampoNumero
              id="otros_gastos_dolares"
              name="otros_gastos_dolares"
              defaultValue={contenedor.otros_gastos_dolares}
              className={claseCampo}
            />
          </div>
          <div>
            <label htmlFor="otros_gastos_tipo_cambio" className="block text-xs font-medium text-zinc-500">
              Tipo de cambio
            </label>
            <CampoNumero
              id="otros_gastos_tipo_cambio"
              name="otros_gastos_tipo_cambio"
              defaultValue={contenedor.otros_gastos_tipo_cambio}
              className={claseCampo}
            />
          </div>
        </div>
      </details>

      <div className="flex items-center justify-between border-t border-zinc-100 pt-4">
        <button
          type="button"
          onClick={() => {
            const escrito = prompt(
              `Vas a mandar el contenedor ${contenedor.numero} a la papelera (lo puedes restaurar después). Escribe ${contenedor.numero} para confirmar.`,
            );
            if (escrito?.trim() === String(contenedor.numero)) {
              eliminarContenedor(contenedor.id);
            } else if (escrito !== null) {
              alert("No coincide el número, no se borró nada.");
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

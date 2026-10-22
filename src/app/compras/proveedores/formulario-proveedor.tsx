"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Selector } from "@/components/selector";
import { BotonGuardar } from "@/components/boton-guardar";
import { CONDICIONES_PAGO, type CondicionesPago } from "@/lib/tipos";
import { crearProveedor } from "../actions";

const claseInput = "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export function FormularioProveedor() {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [condiciones, setCondiciones] = useState<CondicionesPago>("AL_RECIBIR");
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  return (
    <form
      key={version}
      ref={ref}
      onSubmit={async (e) => {
        e.preventDefault();
        setGuardando(true);
        setError(null);
        const r = await crearProveedor(new FormData(e.currentTarget));
        setGuardando(false);
        if (r.error) {
          setError(r.error);
          return;
        }
        setVersion((v) => v + 1);
        setCondiciones("AL_RECIBIR");
        router.refresh();
      }}
      className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-zinc-900">Agregar proveedor</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Nombre o razón social</label>
          <input type="text" name="nombre" required placeholder="Ej. Plásticos del Norte" className={claseInput} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Contacto (opcional)</label>
          <input type="text" name="contacto" placeholder="Con quién hablas" className={claseInput} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Teléfono / WhatsApp (opcional)</label>
          <input type="text" name="telefono" placeholder="Ej. 55 1234 5678" className={claseInput} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">¿Cómo te cobra normalmente?</label>
          <div className="mt-1">
            <Selector name="condiciones_pago" defaultValue={condiciones} onChange={(v) => setCondiciones(v as CondicionesPago)} opciones={CONDICIONES_PAGO.map((c) => ({ value: c.valor, label: c.etiqueta }))} />
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">{CONDICIONES_PAGO.find((c) => c.valor === condiciones)?.descripcion}</p>
        </div>
        {condiciones === "CREDITO" && (
          <div>
            <label className="block text-xs font-medium text-zinc-500">Días de crédito</label>
            <input type="number" name="dias_credito" min={1} placeholder="Ej. 30" required className={claseInput} />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-zinc-500">Correo (opcional)</label>
          <input type="email" name="correo" className={claseInput} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">RFC (opcional)</label>
          <input type="text" name="rfc" className={`${claseInput} font-mono uppercase`} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-zinc-500">Notas (opcional)</label>
          <input type="text" name="notas" placeholder="Horarios, dirección, qué te surte…" className={claseInput} />
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex justify-end">
        <BotonGuardar cargando={guardando} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
          Guardar proveedor
        </BotonGuardar>
      </div>
    </form>
  );
}

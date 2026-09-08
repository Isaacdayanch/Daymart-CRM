"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Selector } from "@/components/selector";
import { corregirCantidadStock } from "../../actions";

interface BodegaConStock {
  id: string;
  nombre: string;
  cantidad: number;
}

export function AjustarCantidad({
  sku,
  nombre,
  imagenUrl,
  piezasPorCaja,
  bodegas,
}: {
  sku: string;
  nombre: string;
  imagenUrl: string | null;
  piezasPorCaja: number;
  bodegas: BodegaConStock[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [bodegaId, setBodegaId] = useState(
    bodegas.find((b) => b.cantidad > 0)?.id ?? bodegas[0]?.id ?? "",
  );
  const [cantidadNueva, setCantidadNueva] = useState("");
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cantidadActual = bodegas.find((b) => b.id === bodegaId)?.cantidad ?? 0;

  async function guardar(motivo: "SALIDA" | "AJUSTE") {
    setEnviando(true);
    setError(null);
    const formData = new FormData();
    formData.set("sku", sku);
    formData.set("nombre", nombre);
    formData.set("bodega_id", bodegaId);
    formData.set("cantidad_nueva", cantidadNueva);
    formData.set("motivo", motivo);
    formData.set("piezas_por_caja", String(piezasPorCaja));
    formData.set("imagen_url", imagenUrl ?? "");
    const resultado = await corregirCantidadStock(formData);
    setEnviando(false);
    if (resultado?.error) {
      setError(resultado.error);
      setPidiendoMotivo(false);
    } else {
      setAbierto(false);
      setPidiendoMotivo(false);
      setCantidadNueva("");
      router.refresh();
    }
  }

  function alContinuar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!bodegaId) {
      setError("Elige una bodega.");
      return;
    }
    const nueva = Number(cantidadNueva);
    if (!Number.isFinite(nueva) || nueva < 0) {
      setError("La cantidad no es válida.");
      return;
    }
    const diferencia = nueva - cantidadActual;
    if (diferencia === 0) {
      setError("Esa ya es la cantidad actual — no hay nada que corregir.");
      return;
    }
    if (diferencia > 0) {
      guardar("AJUSTE");
    } else {
      setPidiendoMotivo(true);
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="shrink-0 text-xs font-medium text-zinc-500 hover:text-zinc-900"
      >
        Corregir cantidad →
      </button>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      {!pidiendoMotivo ? (
        <form onSubmit={alContinuar} className="space-y-3">
          <p className="text-xs font-medium text-zinc-500">
            Pon la cantidad real que hay en bodega — si baja, te voy a preguntar por qué.
          </p>
          {bodegas.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-zinc-500">Bodega</label>
              <div className="mt-1">
                <Selector
                  defaultValue={bodegaId}
                  onChange={setBodegaId}
                  opciones={bodegas.map((b) => ({ value: b.id, label: `${b.nombre} (${b.cantidad} pzas)` }))}
                />
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-zinc-500">
              Cantidad real (actualmente: {cantidadActual} pzas)
            </label>
            <input
              type="number"
              min={0}
              required
              value={cantidadNueva}
              onChange={(e) => setCantidadNueva(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enviando}
              className="rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {enviando ? "Guardando..." : "Continuar"}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-medium text-zinc-900">
            Va a bajar de {cantidadActual} a {cantidadNueva} piezas. ¿Por qué?
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={enviando}
              onClick={() => guardar("SALIDA")}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-left text-sm hover:bg-zinc-100 disabled:opacity-50"
            >
              <span className="block font-medium text-zinc-900">Fue una salida</span>
              <span className="block text-xs text-zinc-500">Se vendió, se mandó a Full, etc. — sí cuenta como venta.</span>
            </button>
            <button
              type="button"
              disabled={enviando}
              onClick={() => guardar("AJUSTE")}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-left text-sm hover:bg-zinc-100 disabled:opacity-50"
            >
              <span className="block font-medium text-zinc-900">Fue un ajuste</span>
              <span className="block text-xs text-zinc-500">
                Ej. el contenedor llegó con menos de lo registrado, o un error de conteo — no cuenta como venta.
              </span>
            </button>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setPidiendoMotivo(false)}
              className="text-xs text-zinc-500 hover:text-zinc-900"
            >
              ← Regresar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

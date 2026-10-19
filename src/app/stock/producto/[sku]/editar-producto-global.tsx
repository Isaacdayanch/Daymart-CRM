"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoImagen } from "@/components/campo-imagen";
import { CampoMonto } from "@/components/campo-monto";
import { CampoNumero } from "@/components/campo-numero";
import { BloqueMancuerna, derivadosDe, estadoMancuernaInicial, type EstadoMancuerna } from "@/components/bloque-mancuerna";
import { numeroCorto, type CamposMancuerna } from "@/lib/mancuernas";
import { actualizarProductoGlobal } from "../../actions";

import { BotonGuardar } from "@/components/boton-guardar";
const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

/** Datos mínimos para prellenar el formulario — no requiere una fila real
 * en "productos" (hay SKUs cargados con "Agregar stock manual"/"Carga
 * masiva" que solo existen en movimientos_stock, y aun así deben poder
 * editarse desde aquí). */
interface DatosProducto {
  sku: string;
  nombre: string;
  imagen_url: string | null;
  categoria: string | null;
  piezas_por_caja: number;
  fabrica: string | null;
  proveedor: string | null;
  /** De la ficha del catálogo (medidas de la caja, peso, precio mínimo). */
  largo_cm?: number | null;
  ancho_cm?: number | null;
  alto_cm?: number | null;
  peso_kg?: number | null;
  precio_venta?: number | null;
  /** Mancuerna (0053): cómo se capturó (peso lb/kg, por par, precio del proveedor). */
  mancuerna?: CamposMancuerna | null;
}

export function EditarProductoGlobal({ sku, producto }: { sku: string; producto: DatosProducto }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mancuerna, setMancuerna] = useState<EstadoMancuerna>(() => estadoMancuernaInicial(producto.mancuerna));
  const pesoMancuerna = derivadosDe(mancuerna).pesoKg;

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="shrink-0 text-xs font-medium text-zinc-500 hover:text-zinc-900"
      >
        Editar producto →
      </button>
    );
  }

  return (
    <form
      action={async (formData) => {
        setEnviando(true);
        setError(null);
        const resultado = await actualizarProductoGlobal(sku, formData);
        setEnviando(false);
        if (resultado?.error) {
          setError(resultado.error);
        } else {
          setEditando(false);
          if (resultado?.skuNuevo && resultado.skuNuevo !== sku) {
            router.push(`/stock/producto/${encodeURIComponent(resultado.skuNuevo)}`);
          } else {
            router.refresh();
          }
        }
      }}
      className="w-full space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4"
    >
      <p className="text-xs font-medium text-amber-700">
        Esto corrige el producto en TODOS los contenedores donde lo has traído, no solo aquí.
      </p>
      <div className="flex items-start gap-4">
        <CampoImagen name="imagen" valorInicial={producto.imagen_url} />
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-zinc-500">SKU</label>
            <input type="text" name="sku" defaultValue={producto.sku} required className={`${claseCampo} font-mono`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Nombre</label>
            <input type="text" name="nombre" defaultValue={producto.nombre} required className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Categoría</label>
            <input type="text" name="categoria" defaultValue={producto.categoria ?? ""} className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Piezas por caja</label>
            <input
              type="number"
              name="piezas_por_caja"
              min={1}
              defaultValue={producto.piezas_por_caja || 1}
              className={claseCampo}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Fábrica</label>
            <input type="text" name="fabrica" defaultValue={producto.fabrica ?? ""} className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Proveedor</label>
            <input type="text" name="proveedor" defaultValue={producto.proveedor ?? ""} className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Caja: largo (cm)</label>
            <CampoNumero name="largo_cm" defaultValue={producto.largo_cm || undefined} className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Caja: ancho (cm)</label>
            <CampoNumero name="ancho_cm" defaultValue={producto.ancho_cm || undefined} className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Caja: alto (cm)</label>
            <CampoNumero name="alto_cm" defaultValue={producto.alto_cm || undefined} className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Peso por pieza (kg)</label>
            {mancuerna.activo ? (
              <p className={`${claseCampo} bg-zinc-100 text-zinc-700`}>{pesoMancuerna > 0 ? numeroCorto(pesoMancuerna, 2) : "—"} <span className="text-[11px] text-zinc-400">(del peso de la mancuerna)</span></p>
            ) : (
              <CampoNumero name="peso_kg" defaultValue={producto.peso_kg || undefined} className={claseCampo} />
            )}
          </div>
          <div className="sm:col-span-2">
            <input type="hidden" name="mancuerna_formulario" value="1" />
            <BloqueMancuerna estado={mancuerna} onChange={setMancuerna} claseCampo={claseCampo} />
            {mancuerna.activo && <p className="mt-1 text-[11px] text-zinc-400">Aquí &ldquo;Piezas por caja&rdquo; va en piezas sueltas. El precio por pieza se recalcula en los contenedores que todavía no se reciben.</p>}
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-zinc-500">Precio mínimo de venta (sin IVA, para vendedores)</label>
            <CampoMonto name="precio_venta" defaultValue={producto.precio_venta || undefined} className={claseCampo} />
            <p className="mt-1 text-[11px] text-zinc-400">Vacío = sin precio. Las medidas y el peso también se actualizan en los contenedores que todavía no se reciben.</p>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setEditando(false)}
          className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
        >
          Cancelar
        </button>
        <BotonGuardar cargando={enviando} className="rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
          Guardar en todos los contenedores
        </BotonGuardar>
      </div>
    </form>
  );
}

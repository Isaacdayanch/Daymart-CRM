"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoNumero } from "@/components/campo-numero";
import { SelectorProducto } from "@/app/stock/salidas/selector-producto";
import { comisionPorPieza } from "@/lib/calculos-vendedores";
import { formatoPesos } from "@/lib/formato";
import type { ComisionVendedorProducto, Vendedor } from "@/lib/tipos";
import { guardarComisionEspecial, quitarComisionEspecial } from "../actions";

const claseCampo = "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

interface ProductoOpcion {
  sku: string;
  nombre: string;
  stockActual: number;
  imagenUrl: string | null;
  precioVenta: number | null;
}

/** Comisiones especiales por producto: si un vendedor negoció algo distinto
 * para un producto, aquí se captura; para los demás aplica su comisión
 * habitual. */
export function ComisionesEspeciales({ vendedor, especiales, productos }: { vendedor: Vendedor; especiales: ComisionVendedorProducto[]; productos: ProductoOpcion[] }) {
  const router = useRouter();
  const [agregando, setAgregando] = useState(false);
  const [sku, setSku] = useState("");
  const [error, setError] = useState<string | null>(null);
  const porSku = new Map(productos.map((p) => [p.sku, p]));

  async function correr(fn: () => Promise<{ error: string | null }>) {
    setError(null);
    const r = await fn();
    if (r.error) setError(r.error);
    else router.refresh();
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 p-5">
        <h3 className="text-sm font-semibold text-zinc-900">Comisiones especiales por producto</h3>
        <p className="mt-0.5 text-xs text-zinc-500">Solo si negociaste algo distinto para un producto. Para todo lo demás aplica su comisión habitual.</p>
      </div>
      {especiales.length > 0 && (
        <ul className="divide-y divide-zinc-100">
          {especiales.map((e) => {
            const p = porSku.get(e.sku);
            const regla = { pct: Number(e.comision_pct) || 0, fija: Number(e.comision_fija) || 0 };
            return (
              <li key={e.sku} className="flex items-center gap-3 px-5 py-3 text-sm">
                {p?.imagenUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- miniatura
                  <img src={p.imagenUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="h-9 w-9 shrink-0 rounded-lg bg-zinc-100" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-zinc-900">{p?.nombre ?? e.sku}</p>
                  <p className="text-xs text-zinc-500">
                    <span className="font-mono">{e.sku}</span> · {[regla.pct > 0 && `${regla.pct}%`, regla.fija > 0 && `$${regla.fija.toLocaleString("es-MX")} por pza`].filter(Boolean).join(" + ") || "sin comisión"}
                    {p?.precioVenta ? ` → ${formatoPesos(comisionPorPieza(p.precioVenta, regla))} por pieza` : " · sin precio todavía"}
                  </p>
                </div>
                <button type="button" onClick={() => correr(() => quitarComisionEspecial(vendedor.id, e.sku))} className="text-xs text-zinc-400 hover:text-red-600">
                  quitar
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-zinc-100 p-5">
        {agregando ? (
          <form
            action={async (fd) => {
              await correr(() => guardarComisionEspecial(vendedor.id, fd));
              setAgregando(false);
              setSku("");
            }}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-500">Producto</label>
              <SelectorProducto opciones={productos} value={sku} onChange={setSku} />
              <input type="hidden" name="sku" value={sku} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Comisión (%)</label>
              <CampoNumero name="comision_pct" defaultValue={Number(vendedor.comision_pct)} className={claseCampo} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Fija por pieza</label>
              <CampoNumero name="comision_fija" defaultValue={Number(vendedor.comision_fija) || undefined} className={claseCampo} />
            </div>
            <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
              <button type="submit" disabled={!sku} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50">
                Guardar
              </button>
              <button type="button" onClick={() => setAgregando(false)} className="text-xs text-zinc-500 hover:text-zinc-900">
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setAgregando(true)} className="text-sm font-medium text-zinc-700 hover:text-zinc-900 hover:underline">
            + Comisión especial para un producto
          </button>
        )}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}

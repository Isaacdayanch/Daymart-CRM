"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CampoMonto } from "@/components/campo-monto";
import { Selector } from "@/components/selector";
import { rentabilidadPieza, type ReglaComision } from "@/lib/calculos-vendedores";
import { formatoPesos } from "@/lib/formato";
import type { ComisionVendedorProducto, Vendedor } from "@/lib/tipos";
import { guardarPrecioVenta } from "../actions";

export interface FilaPrecio {
  sku: string;
  nombre: string;
  categoria: string | null;
  imagenUrl: string | null;
  stock: number;
  costo: number;
  precioVenta: number | null;
}

function colorMargen(pct: number) {
  if (pct < 0) return "text-red-700";
  if (pct < 20) return "text-amber-700";
  return "text-emerald-700";
}

function Fila({ p, regla, margenObjetivo }: { p: FilaPrecio; regla: ReglaComision; margenObjetivo: number }) {
  const router = useRouter();
  const [precio, setPrecio] = useState(p.precioVenta !== null ? String(p.precioVenta) : "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const numero = Number(precio) || 0;
  const guardado = p.precioVenta ?? 0;
  const cambio = numero !== guardado;
  const r = numero > 0 ? rentabilidadPieza(numero, p.costo, regla) : null;

  async function guardar() {
    setGuardando(true);
    setError(null);
    const res = await guardarPrecioVenta(p.sku, numero > 0 ? numero : null);
    setGuardando(false);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <tr className={`align-middle ${cambio ? "bg-amber-50/60" : ""}`}>
      <td className="py-2 pl-4 pr-2 sm:pl-5">
        <div className="flex items-center gap-3">
          {p.imagenUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- miniatura
            <img src={p.imagenUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="h-10 w-10 shrink-0 rounded-lg bg-zinc-100" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-900">{p.nombre}</p>
            <p className="truncate text-xs text-zinc-400">
              <span className="font-mono">{p.sku}</span>
              {p.categoria && ` · ${p.categoria}`} · {p.stock.toLocaleString("es-MX")} en bodega
            </p>
          </div>
        </div>
      </td>
      <td className="px-2 py-2 text-right text-sm tabular-nums text-zinc-500">{p.costo > 0 ? formatoPesos(p.costo) : <span className="text-amber-600">sin costo</span>}</td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-1.5">
          <div className="w-32">
            <CampoMonto value={precio} onChange={setPrecio} placeholder="0" className="block w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-right focus:border-zinc-500 focus:ring-zinc-500" />
          </div>
          {cambio && (
            <button type="button" onClick={guardar} disabled={guardando} className="rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50">
              {guardando ? "…" : "Guardar"}
            </button>
          )}
        </div>
        {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      </td>
      <td className="px-2 py-2 text-right text-sm tabular-nums text-zinc-700">{r ? formatoPesos(r.comision) : "—"}</td>
      <td className={`px-2 py-2 text-right text-sm font-semibold tabular-nums ${r ? colorMargen(r.margenPct) : "text-zinc-300"}`}>{r ? formatoPesos(r.teQueda) : "—"}</td>
      <td className={`py-2 pl-2 pr-4 text-right text-sm tabular-nums sm:pr-5 ${r ? colorMargen(r.margenPct) : "text-zinc-300"}`}>
        {r ? `${r.margenPct.toFixed(0)}%` : "—"}
        {r && r.margenPct < margenObjetivo && r.margenPct >= 0 && <span className="block text-[10px] text-amber-600">abajo de {margenObjetivo}%</span>}
      </td>
    </tr>
  );
}

export function TablaPrecios({ filas, vendedores, especiales }: { filas: FilaPrecio[]; vendedores: Vendedor[]; especiales: ComisionVendedorProducto[] }) {
  const [vendedorId, setVendedorId] = useState(vendedores[0]?.id ?? "");
  const [pctLibre, setPctLibre] = useState("10");
  const [busqueda, setBusqueda] = useState("");
  const [soloSinPrecio, setSoloSinPrecio] = useState(false);
  const [margenObjetivo, setMargenObjetivo] = useState("20");

  const vendedor = vendedores.find((v) => v.id === vendedorId);
  const reglaBase: ReglaComision = vendedor
    ? { pct: Number(vendedor.comision_pct) || 0, fija: Number(vendedor.comision_fija) || 0 }
    : { pct: Number(pctLibre) || 0, fija: 0 };
  const especialesDe = useMemo(() => (vendedor ? especiales.filter((e) => e.vendedor_id === vendedor.id) : []), [especiales, vendedor]);

  const texto = busqueda.trim().toLowerCase();
  const visibles = filas
    .filter((f) => !soloSinPrecio || f.precioVenta === null)
    .filter((f) => !texto || [f.nombre, f.sku, f.categoria].some((t) => t?.toLowerCase().includes(texto)));
  const sinPrecio = filas.filter((f) => f.precioVenta === null).length;
  const objetivo = Number(margenObjetivo) || 0;
  const reglaPara = (sku: string): ReglaComision => {
    const e = especialesDe.find((x) => x.sku === sku);
    return e ? { pct: Number(e.comision_pct) || 0, fija: Number(e.comision_fija) || 0 } : reglaBase;
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="space-y-3 border-b border-zinc-100 p-5">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Lista de precios y rentabilidad</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Una sola lista para todos los vendedores (precios sin IVA). Es el <strong>precio mínimo autorizado</strong>: el vendedor puede subirlo desde su link y el sobreprecio es suyo; tu rentabilidad se calcula sobre este mínimo. Escribe el precio y ve en vivo cuánto se lleva el vendedor y cuánto te queda a ti.
            {sinPrecio > 0 && <> <strong>{sinPrecio}</strong> producto(s) sin precio todavía: no salen en ningún link.</>}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Simular con la comisión de</label>
            <div className="mt-1">
              <Selector
                defaultValue={vendedorId}
                onChange={setVendedorId}
                opciones={[...vendedores.map((v) => ({ value: v.id, label: `${v.nombre} (${Number(v.comision_pct)}%${Number(v.comision_fija) ? ` + $${Number(v.comision_fija)}` : ""})` })), { value: "", label: "Un % que yo escriba" }]}
              />
            </div>
          </div>
          {!vendedor && (
            <div>
              <label className="block text-xs font-medium text-zinc-500">Comisión (%)</label>
              <input type="number" min={0} max={100} step="0.5" value={pctLibre} onChange={(e) => setPctLibre(e.target.value)} className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500" />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-zinc-500">Margen que quiero (%)</label>
            <input type="number" min={0} max={95} step="1" value={margenObjetivo} onChange={(e) => setMargenObjetivo(e.target.value)} className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Buscar</label>
            <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre, SKU o categoría…" className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500" />
          </div>
          <label className="flex items-end gap-2 pb-2 text-xs text-zinc-700">
            <input type="checkbox" checked={soloSinPrecio} onChange={(e) => setSoloSinPrecio(e.target.checked)} className="rounded border-zinc-300" />
            Solo los que no tienen precio
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-zinc-100 text-[11px] uppercase tracking-wide text-zinc-400">
              <th className="py-2 pl-4 pr-2 font-medium sm:pl-5">Producto</th>
              <th className="px-2 py-2 text-right font-medium">Costo</th>
              <th className="px-2 py-2 font-medium">Precio mínimo autorizado</th>
              <th className="px-2 py-2 text-right font-medium">Comisión</th>
              <th className="px-2 py-2 text-right font-medium">Te queda</th>
              <th className="py-2 pl-2 pr-4 text-right font-medium sm:pr-5">Margen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visibles.map((f) => (
              <Fila key={f.sku} p={f} regla={reglaPara(f.sku)} margenObjetivo={objetivo} />
            ))}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-zinc-400">
                  Nada con ese filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-zinc-100 px-5 py-3 text-[11px] text-zinc-400">
        Te queda = precio − costo promedio del stock − comisión del vendedor. Margen = te queda ÷ precio. Rojo: pierdes; ámbar: abajo del margen que quieres.
      </p>
    </div>
  );
}

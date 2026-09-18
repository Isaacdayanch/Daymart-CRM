"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Selector } from "@/components/selector";
import { formatoFechaHoraMx } from "@/lib/fechas-mx";
import type { RecepcionFull } from "@/lib/tipos";
import { atenderRecepcion } from "./actions";

/** "Mercado Libre recibió N piezas de X. ¿Le damos salida a tu bodega?" */
export function TarjetaRecepcion({
  recepcion: r,
  enviosPreparados,
  productos,
}: {
  recepcion: RecepcionFull;
  enviosPreparados: { id: string; etiqueta: string; skus: string[] }[];
  productos: { sku: string; nombre: string }[];
}) {
  const router = useRouter();
  const [sku, setSku] = useState(r.sku_crm ?? "");
  const [cantidad, setCantidad] = useState(String(r.cantidad));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mostrarLiga, setMostrarLiga] = useState(!r.sku_crm);
  const enviosDelSku = enviosPreparados.filter((e) => e.skus.includes(sku));
  const [envioId, setEnvioId] = useState<string>("");

  async function decidir(decision: "SALIDA" | "IGNORADA") {
    setEnviando(true);
    setError(null);
    const fd = new FormData();
    fd.set("decision", decision);
    fd.set("sku", sku);
    fd.set("cantidad", cantidad);
    if (decision === "SALIDA") fd.set("envio_id", envioId || (enviosDelSku.length ? "" : "NINGUNO"));
    const res = await atenderRecepcion(r.id, fd);
    setEnviando(false);
    if (res?.error) setError(res.error);
    else router.refresh();
  }

  return (
    <div className="rounded-2xl border border-[#2D3277]/25 bg-[#2D3277]/5 p-5">
      <p className="text-sm text-zinc-900">
        Mercado Libre recibió <strong>+{r.cantidad.toLocaleString("es-MX")}</strong> piezas de <strong>{r.titulo ?? r.item_id}</strong>
        <span className="text-zinc-500"> ({r.total_antes.toLocaleString("es-MX")} → {r.total_despues.toLocaleString("es-MX")} en Full)</span>
      </p>
      <p className="text-xs text-zinc-500">detectado {formatoFechaHoraMx(r.detectado_en)} · {r.item_id}</p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        {mostrarLiga || !sku ? (
          <div className="min-w-[16rem]">
            <label className="block text-[11px] font-medium text-zinc-500">Producto del CRM</label>
            <div className="mt-1">
              <Selector
                defaultValue={sku}
                onChange={setSku}
                placeholder="Elige el producto"
                opciones={productos.map((p) => ({ value: p.sku, label: `${p.nombre} (${p.sku})` }))}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-700">
            Producto: <strong>{productos.find((p) => p.sku === sku)?.nombre ?? sku}</strong>{" "}
            <button type="button" onClick={() => setMostrarLiga(true)} className="text-xs text-zinc-400 underline hover:text-zinc-700">
              cambiar
            </button>
          </p>
        )}
        <div>
          <label className="block text-[11px] font-medium text-zinc-500">Piezas que salen de bodega</label>
          <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="mt-1 w-28 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm" />
        </div>
        {enviosDelSku.length > 1 && (
          <div>
            <label className="block text-[11px] font-medium text-zinc-500">¿De qué envío?</label>
            <div className="mt-1">
              <Selector defaultValue={envioId} onChange={setEnvioId} placeholder="El más viejo" opciones={[{ value: "", label: "El más viejo primero" }, ...enviosDelSku.map((e) => ({ value: e.id, label: e.etiqueta }))]} />
            </div>
          </div>
        )}
      </div>
      {enviosDelSku.length === 0 && sku && <p className="mt-2 text-xs text-amber-700">No tienes un envío a Full preparado con este producto: la salida se registra suelta.</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={enviando || !sku} onClick={() => decidir("SALIDA")} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50">
          Sí, salió de mi bodega
        </button>
        <button type="button" disabled={enviando} onClick={() => decidir("IGNORADA")} className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
          No fue de mi bodega
        </button>
      </div>
    </div>
  );
}

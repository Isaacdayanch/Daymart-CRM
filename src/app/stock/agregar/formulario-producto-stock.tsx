"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoImagen } from "@/components/campo-imagen";
import { CampoMonto } from "@/components/campo-monto";
import { CampoNumero } from "@/components/campo-numero";
import { CampoSugerencias } from "@/components/campo-sugerencias";
import { Selector } from "@/components/selector";
import { skuNuevo, skuSugerido } from "@/lib/calculos";
import type { Bodega, Marca } from "@/lib/tipos";
import { SelectorProducto } from "../salidas/selector-producto";
import { registrarProductoStock } from "../actions";

const claseCampo = "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export interface ProductoExistente {
  sku: string;
  nombre: string;
  stockActual: number;
  imagenUrl: string | null;
  marcaId: string | null;
  categoria: string | null;
  piezasPorCaja: number;
}

/** Alta de producto en Stock (Fase B): "¿Producto nuevo o ya existe?", los
 * mismos datos que un producto de contenedor (marca, categoría, nombre,
 * variante, SKU que se arma solo, foto, piezas por caja, medidas), y de
 * dónde viene el stock: inicial/histórico (entraron X, salieron Y → quedan
 * Z) o una entrada suelta de hoy. */
export function FormularioProductoStock({
  bodegas,
  marcas,
  categorias,
  existentes,
}: {
  bodegas: Bodega[];
  marcas: Marca[];
  categorias: string[];
  existentes: ProductoExistente[];
}) {
  const router = useRouter();
  const hoyTexto = new Date().toISOString().slice(0, 10);
  const [origen, setOrigen] = useState<"NUEVO" | "EXISTENTE">("NUEVO");
  const [skuExistente, setSkuExistente] = useState("");
  const existente = existentes.find((p) => p.sku === skuExistente);
  const [modo, setModo] = useState<"INICIAL" | "ENTRADA">("INICIAL");

  const marcaPorDefecto = marcas.find((m) => m.codigo === "DAY") ?? marcas[0];
  const [marcaId, setMarcaId] = useState(marcaPorDefecto?.id ?? "");
  const [categoria, setCategoria] = useState("");
  const [nombre, setNombre] = useState("");
  const [variante, setVariante] = useState("");
  const [sku, setSku] = useState("");
  const [skuManual, setSkuManual] = useState(false);
  const [entradas, setEntradas] = useState("");
  const [salidas, setSalidas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function armarSku(d: { nombre?: string; marcaId?: string; variante?: string; categoria?: string }) {
    const marca = marcas.find((m) => m.id === (d.marcaId ?? marcaId));
    const nom = d.nombre ?? nombre;
    return marca ? skuNuevo(marca.codigo, nom, d.variante ?? variante) : skuSugerido(d.categoria ?? categoria, nom);
  }
  const actualizar = (d: { nombre?: string; marcaId?: string; variante?: string; categoria?: string }) => {
    if (d.nombre !== undefined) setNombre(d.nombre);
    if (d.marcaId !== undefined) setMarcaId(d.marcaId);
    if (d.variante !== undefined) setVariante(d.variante);
    if (d.categoria !== undefined) setCategoria(d.categoria);
    if (!skuManual) setSku(armarSku(d));
  };

  const quedan = (Number(entradas) || 0) - (Number(salidas) || 0);
  const skuFinal = origen === "EXISTENTE" ? existente?.sku ?? "" : sku;
  const nombreFinal = origen === "EXISTENTE" ? existente?.nombre ?? "" : nombre;

  return (
    <form
      action={async (formData) => {
        setEnviando(true);
        setError(null);
        formData.set("sku", skuFinal);
        formData.set("nombre", nombreFinal);
        formData.set("modo", modo);
        if (origen === "EXISTENTE" && existente) {
          formData.set("imagen_url_previa", existente.imagenUrl ?? "");
          if (existente.marcaId) formData.set("marca_id", existente.marcaId);
          if (existente.categoria) formData.set("categoria", existente.categoria);
        }
        const r = await registrarProductoStock(formData);
        setEnviando(false);
        if (r?.error) setError(r.error);
        else router.push(`/stock/producto/${encodeURIComponent(skuFinal)}`);
      }}
      className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
    >
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* ¿Nuevo o existente? */}
      <div className="flex gap-1.5 rounded-xl bg-zinc-100 p-1">
        {(
          [
            ["NUEVO", "Producto nuevo"],
            ["EXISTENTE", "Ya existe en el sistema"],
          ] as const
        ).map(([v, t]) => (
          <button key={v} type="button" onClick={() => setOrigen(v)} className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${origen === v ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
            {t}
          </button>
        ))}
      </div>

      {origen === "EXISTENTE" ? (
        <div>
          <label className="block text-xs font-medium text-zinc-500">Producto</label>
          <div className="mt-1">
            <SelectorProducto opciones={existentes} value={skuExistente} onChange={setSkuExistente} />
          </div>
          {existente && (
            <p className="mt-1 text-xs text-zinc-500">
              Hoy tiene <strong className="text-zinc-900">{existente.stockActual.toLocaleString("es-MX")}</strong> piezas en el sistema · {existente.piezasPorCaja} por caja
              <input type="hidden" name="piezas_por_caja" value={existente.piezasPorCaja} />
            </p>
          )}
        </div>
      ) : (
        <>
          {marcas.length === 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Marca y SKU nuevo se activan al correr el SQL 0038 en Supabase. Mientras, el SKU se arma con categoría + nombre.</p>
          )}
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              <CampoImagen name="imagen" />
            </div>
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              {marcas.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-zinc-500">Marca</label>
                  <div className="mt-1">
                    <Selector name="marca_id" defaultValue={marcaId} onChange={(v) => actualizar({ marcaId: v })} opciones={marcas.map((m) => ({ value: m.id, label: `${m.nombre} (${m.codigo})` }))} />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-zinc-500">Categoría</label>
                <CampoSugerencias name="categoria" required value={categoria} onChange={(v) => actualizar({ categoria: v })} sugerencias={categorias} className={claseCampo} />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500">Nombre del producto</label>
                <input type="text" required value={nombre} onChange={(e) => actualizar({ nombre: e.target.value })} className={claseCampo} />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500">Variante (color, talla, medida — opcional)</label>
                <input type="text" name="variante" value={variante} onChange={(e) => actualizar({ variante: e.target.value })} placeholder="Ej. Gris, 10 kg, 120 cm" className={claseCampo} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-zinc-500">SKU (se arma solo: marca-producto-variante; edítalo si quieres)</label>
                <input
                  type="text"
                  required
                  value={sku}
                  onChange={(e) => {
                    setSkuManual(true);
                    setSku(e.target.value.toUpperCase());
                  }}
                  className={`${claseCampo} font-mono`}
                />
                {existentes.some((p) => p.sku === sku) && sku && <p className="mt-1 text-xs text-amber-700">Ese SKU ya existe: lo que registres se sumará a ese producto. Si es otro, cambia la variante o el SKU.</p>}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500">Piezas por caja</label>
              <CampoNumero name="piezas_por_caja" defaultValue={1} className={claseCampo} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Largo (cm)</label>
              <CampoNumero name="largo_cm" className={claseCampo} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Ancho (cm)</label>
              <CampoNumero name="ancho_cm" className={claseCampo} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Alto (cm)</label>
              <CampoNumero name="alto_cm" className={claseCampo} />
            </div>
          </div>
        </>
      )}

      {/* ¿De dónde viene el stock? */}
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
        <p className="text-xs font-medium text-zinc-500">¿De dónde viene este stock?</p>
        <div className="mt-2 flex gap-1.5 rounded-xl bg-zinc-100 p-1">
          {(
            [
              ["INICIAL", "Stock inicial / de antes del sistema"],
              ["ENTRADA", "Entrada suelta (compra local, etc.)"],
            ] as const
          ).map(([v, t]) => (
            <button key={v} type="button" onClick={() => setModo(v)} className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${modo === v ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
              {t}
            </button>
          ))}
        </div>
        {modo === "INICIAL" ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500">Han entrado en total</label>
              <input type="number" name="entradas_total" min={1} required value={entradas} onChange={(e) => setEntradas(e.target.value)} placeholder="450" className={claseCampo} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Han salido en total</label>
              <input type="number" name="salidas_total" min={0} value={salidas} onChange={(e) => setSalidas(e.target.value)} placeholder="320" className={claseCampo} />
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs text-emerald-800">Quedan en bodega</p>
              <p className={`text-xl font-semibold ${quedan < 0 ? "text-red-600" : "text-emerald-900"}`}>{quedan.toLocaleString("es-MX")} pzas</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Fecha de corte del histórico</label>
              <div className="mt-1">
                <CampoFecha name="fecha" defaultValue={hoyTexto} max={hoyTexto} />
              </div>
            </div>
            <p className="text-[11px] text-zinc-500 sm:col-span-2">Se guarda como una entrada y una salida marcadas “histórico”: en la ficha ves ese pasado, el stock actual queda en lo que quedan, y esas salidas no ensucian el cálculo de reorden.</p>
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500">Cantidad que entra</label>
              <input type="number" name="cantidad" min={1} required className={claseCampo} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Fecha</label>
              <div className="mt-1">
                <CampoFecha name="fecha" defaultValue={hoyTexto} max={hoyTexto} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Nota</label>
              <input type="text" name="referencia" placeholder="Ej. Compra local en México" className={claseCampo} />
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Bodega</label>
          <div className="mt-1">
            <Selector name="bodega_id" defaultValue={bodegas[0]?.id} opciones={bodegas.map((b) => ({ value: b.id, label: b.nombre }))} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Costo por pieza (pesos)</label>
          <CampoMonto name="costo_unitario_pesos" className={claseCampo} />
          <p className="mt-1 text-[11px] text-zinc-400">Si no lo sabes, déjalo en 0 y lo corriges después en la ficha del producto.</p>
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button type="submit" disabled={enviando || (origen === "EXISTENTE" && !existente)} className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 disabled:opacity-50">
          {enviando ? "Guardando…" : modo === "INICIAL" ? "Guardar producto con su histórico" : "Registrar entrada"}
        </button>
      </div>
    </form>
  );
}

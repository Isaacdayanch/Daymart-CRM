"use client";

import { CampoMonto } from "@/components/campo-monto";
import { CampoNumero } from "@/components/campo-numero";
import { Selector } from "@/components/selector";
import {
  MODOS_PRECIO,
  UNIDADES_PESO,
  modoPrecioDe,
  numeroCorto,
  pesoEnKg,
  pesoEnLb,
  precioPorPieza,
  unidadPesoDe,
  type CamposMancuerna,
  type ModoPrecio,
  type UnidadPeso,
} from "@/lib/mancuernas";

/** Lo que Isaac captura en el bloque, tal cual (texto para los números,
 * para que los campos se comporten como el resto del formulario). */
export interface EstadoMancuerna {
  activo: boolean;
  peso: string;
  unidad: UnidadPeso;
  par: boolean;
  modo: ModoPrecio;
  precio: string;
}

export function estadoMancuernaInicial(p?: CamposMancuerna | null): EstadoMancuerna {
  return {
    activo: Boolean(p?.es_mancuerna),
    peso: p?.peso_unidad ? String(p.peso_unidad) : "",
    unidad: unidadPesoDe(p?.unidad_peso),
    par: Boolean(p?.vendida_en_par),
    modo: modoPrecioDe(p?.precio_modo),
    precio: p?.precio_capturado ? String(p.precio_capturado) : "",
  };
}

/** Peso por pieza en kg y precio en dólares por pieza suelta, calculados
 * de lo capturado (lo mismo que hace el servidor al guardar). */
export function derivadosDe(e: EstadoMancuerna) {
  const peso = Number(e.peso) || 0;
  const precio = Number(e.precio) || 0;
  return {
    pesoKg: peso > 0 ? pesoEnKg(peso, e.unidad) : 0,
    pesoLb: peso > 0 ? pesoEnLb(peso, e.unidad) : 0,
    precioPieza: precioPorPieza(precio, e.modo, peso, e.unidad),
  };
}

/**
 * Bloque "Es mancuerna / se compra por peso" del formulario de producto
 * (Isaac, 19 oct). Cerrado es una sola casilla discreta — no estorba al
 * cargar un producto normal. Abierto: peso de cada mancuerna en lb o kg (con
 * la conversión en vivo), si el proveedor la vende por par o suelta, y cómo
 * viene el precio (por pieza, par, kilo o libra) con el precio por pieza
 * suelta calculado. Los seis campos viajan al servidor con su `name`; el
 * padre usa `onChange` para adaptar cantidad, piezas por caja, precio y peso.
 */
export function BloqueMancuerna({ estado, onChange, claseCampo }: { estado: EstadoMancuerna; onChange: (e: EstadoMancuerna) => void; claseCampo: string }) {
  const d = derivadosDe(estado);
  const peso = Number(estado.peso) || 0;
  const precio = Number(estado.precio) || 0;

  return (
    <div className={estado.activo ? "rounded-lg border border-sky-200 bg-sky-50/60 p-3" : ""}>
      <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-zinc-700">
        <input
          type="checkbox"
          name="es_mancuerna"
          value="1"
          checked={estado.activo}
          onChange={(e) => onChange({ ...estado, activo: e.target.checked })}
          className="h-4 w-4 rounded border-zinc-300 text-sky-600 focus:ring-sky-500"
        />
        <span>
          Es mancuerna / se compra por peso{" "}
          <span className="font-normal text-zinc-400">(libras o kilos, por par o sueltas)</span>
        </span>
      </label>

      {estado.activo && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500">Peso de cada mancuerna</label>
              <CampoNumero name="peso_unidad" defaultValue={peso || undefined} onChange={(v) => onChange({ ...estado, peso: v })} className={claseCampo} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Unidad</label>
              <div className="mt-1">
                <Selector
                  name="unidad_peso"
                  defaultValue={estado.unidad}
                  onChange={(v) => onChange({ ...estado, unidad: unidadPesoDe(v) })}
                  opciones={UNIDADES_PESO.map((u) => ({ value: u.valor, label: u.etiqueta }))}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">¿Cómo te la vende el proveedor?</label>
              <div className="mt-1">
                <Selector
                  name="vendida_en_par"
                  defaultValue={estado.par ? "1" : "0"}
                  onChange={(v) => onChange({ ...estado, par: v === "1" })}
                  opciones={[
                    { value: "0", label: "Por pieza suelta" },
                    { value: "1", label: "Por par" },
                  ]}
                />
              </div>
            </div>
          </div>
          {peso > 0 && (
            <p className="text-xs text-sky-800">
              {estado.unidad === "LB" ? (
                <>
                  <strong>{numeroCorto(peso)} lb = {numeroCorto(d.pesoKg, 2)} kg</strong> por mancuerna
                </>
              ) : (
                <>
                  <strong>{numeroCorto(peso)} kg = {numeroCorto(d.pesoLb, 2)} lb</strong> por mancuerna
                </>
              )}
              {estado.par && <> · el par pesa {numeroCorto(d.pesoKg * 2, 2)} kg</>}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500">¿Cómo viene el precio del proveedor?</label>
              <div className="mt-1">
                <Selector
                  name="precio_modo"
                  defaultValue={estado.modo}
                  onChange={(v) => onChange({ ...estado, modo: modoPrecioDe(v) })}
                  opciones={MODOS_PRECIO.map((m) => ({ value: m.valor, label: `Precio ${m.etiqueta}` }))}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Precio del proveedor (USD, {MODOS_PRECIO.find((m) => m.valor === estado.modo)?.etiqueta})</label>
              <CampoMonto name="precio_capturado" value={estado.precio} onChange={(v) => onChange({ ...estado, precio: v })} className={claseCampo} />
            </div>
          </div>
          {precio > 0 && (
            <p className="text-xs text-sky-800">
              {(estado.modo === "KG" || estado.modo === "LB") && !(peso > 0) ? (
                <span className="text-amber-700">Pon el peso de cada mancuerna para calcular el precio por pieza.</span>
              ) : (
                <>
                  = <strong>${numeroCorto(d.precioPieza, 2)} USD por pieza suelta</strong>
                  {estado.par && <> (${numeroCorto(d.precioPieza * 2, 2)} el par)</>}
                  {estado.modo === "KG" && peso > 0 && <> · ${numeroCorto(precio, 2)} × {numeroCorto(d.pesoKg, 2)} kg</>}
                  {estado.modo === "LB" && peso > 0 && <> · ${numeroCorto(precio, 2)} × {numeroCorto(d.pesoLb, 2)} lb</>}
                </>
              )}
            </p>
          )}
          <p className="text-[11px] text-zinc-500">
            En bodega y en el costo todo queda en <strong>piezas sueltas</strong> (una mancuerna = una pieza). Si vendes el par en Mercado Libre, al ligar la publicación pon &ldquo;2 piezas por unidad&rdquo;.
          </p>
        </div>
      )}
    </div>
  );
}

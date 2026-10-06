"use client";

import { useState } from "react";
import { CampoNumero } from "@/components/campo-numero";
import { CampoMonto } from "@/components/campo-monto";
import { CampoImagen } from "@/components/campo-imagen";
import { CampoSugerencias } from "@/components/campo-sugerencias";
import { Selector } from "@/components/selector";
import { skuNuevo, skuSugerido } from "@/lib/calculos";
import type { Marca, Producto } from "@/lib/tipos";

/** Cómo va el contenedor HOY (sin esta línea), para decir en vivo cuánto
 * peso y espacio quedan después de agregar el producto. */
export interface OcupacionActual {
  pesoKg: number;
  limitePesoKg: number;
  cbm: number;
  capacidadCbm: number;
}

function colorPct(pct: number) {
  if (pct > 100) return "text-red-700";
  if (pct >= 90) return "text-amber-700";
  return "text-zinc-600";
}

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

/** Campos del formulario de producto, reutilizados para agregar y para editar. */
export function CamposProducto({
  inicial,
  fabricaPorDefecto,
  proveedorPorDefecto,
  categoriaPorDefecto,
  categorias = [],
  fabricas = [],
  proveedores = [],
  marcas = [],
  esRestock = false,
  contenedorRecibido = false,
  ocupacion,
}: {
  inicial?: Partial<Producto>;
  fabricaPorDefecto?: string | null;
  proveedorPorDefecto?: string | null;
  /** Categoría del último producto agregado a este contenedor — casi
   * siempre se repite, así que se precarga en productos nuevos. */
  categoriaPorDefecto?: string | null;
  categorias?: string[];
  fabricas?: string[];
  proveedores?: string[];
  /** Marcas dadas de alta (migración 0038). Con marca, el SKU nuevo se arma
   * MARCA-PRODUCTO-VARIANTE; sin marcas (SQL sin correr) se usa la regla vieja. */
  marcas?: Marca[];
  /** true cuando se rellenan los campos a partir de un producto anterior
   * (restock): no se carga la cantidad ni el id, solo los datos fijos. */
  esRestock?: boolean;
  /** true cuando se está EDITANDO un producto que ya pertenece a un
   * contenedor ya recibido — ahí la cantidad ya no se toca aquí (esto solo
   * corrige el dato del pedido, sin mover el stock), se usa "Editar
   * recepción" para eso, que sí ajusta el stock de verdad. */
  contenedorRecibido?: boolean;
  /** Solo al AGREGAR: peso/espacio ya ocupados, para la proyección en vivo. */
  ocupacion?: OcupacionActual;
}) {
  // Cantidad, peso y medidas en vivo, para decir cuánto pesa y ocupa esta
  // línea antes de guardar (Isaac, 6 oct: las mancuernas llenan el peso
  // mucho antes que el espacio).
  const [cantidadTxt, setCantidadTxt] = useState(esRestock || contenedorRecibido ? (contenedorRecibido ? String(inicial?.cantidad ?? 0) : "") : String(inicial?.cantidad ?? ""));
  const [pesoTxt, setPesoTxt] = useState(inicial?.peso_kg ? String(inicial.peso_kg) : "");
  const [piezasCajaTxt, setPiezasCajaTxt] = useState(inicial?.piezas_por_caja ? String(inicial.piezas_por_caja) : "");
  const [largoTxt, setLargoTxt] = useState(inicial?.largo_cm ? String(inicial.largo_cm) : "");
  const [anchoTxt, setAnchoTxt] = useState(inicial?.ancho_cm ? String(inicial.ancho_cm) : "");
  const [altoTxt, setAltoTxt] = useState(inicial?.alto_cm ? String(inicial.alto_cm) : "");
  const cantidadNum = Number(cantidadTxt) || 0;
  const pesoLinea = (Number(pesoTxt) || 0) * cantidadNum;
  const piezasCaja = Number(piezasCajaTxt) || 0;
  const cbmLinea = piezasCaja > 0 ? ((Number(largoTxt) || 0) * (Number(anchoTxt) || 0) * (Number(altoTxt) || 0) / 1_000_000) * (cantidadNum / piezasCaja) : 0;
  const pesoDespues = ocupacion ? ocupacion.pesoKg + pesoLinea : 0;
  const cbmDespues = ocupacion ? ocupacion.cbm + cbmLinea : 0;
  const pctPeso = ocupacion && ocupacion.limitePesoKg ? (pesoDespues / ocupacion.limitePesoKg) * 100 : 0;
  const pctCbm = ocupacion && ocupacion.capacidadCbm ? (cbmDespues / ocupacion.capacidadCbm) * 100 : 0;
  const [categoria, setCategoria] = useState(inicial?.categoria ?? categoriaPorDefecto ?? "");
  const [fabrica, setFabrica] = useState(inicial?.fabrica ?? fabricaPorDefecto ?? "");
  const [proveedor, setProveedor] = useState(inicial?.proveedor ?? proveedorPorDefecto ?? "");
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const marcaPorDefecto = marcas.find((m) => m.id === inicial?.marca_id) ?? marcas.find((m) => m.codigo === "DAY") ?? marcas[0];
  const [marcaId, setMarcaId] = useState(marcaPorDefecto?.id ?? "");
  const [variante, setVariante] = useState("");
  const [sku, setSku] = useState(inicial?.sku ?? "");
  // Un producto que ya tiene SKU (editar, restock, pendiente de China) lo
  // conserva: el SKU nunca se cambia solo.
  const [skuEditadoManualmente, setSkuEditadoManualmente] = useState(Boolean(inicial?.sku));

  function armarSku(datos: { categoria?: string; nombre?: string; marcaId?: string; variante?: string }) {
    const cat = datos.categoria ?? categoria;
    const nom = datos.nombre ?? nombre;
    const marca = marcas.find((m) => m.id === (datos.marcaId ?? marcaId));
    return marca ? skuNuevo(marca.codigo, nom, datos.variante ?? variante) : skuSugerido(cat, nom);
  }

  function alCambiarCategoria(valor: string) {
    setCategoria(valor);
    if (!skuEditadoManualmente) setSku(armarSku({ categoria: valor }));
  }

  function alCambiarNombre(valor: string) {
    setNombre(valor);
    if (!skuEditadoManualmente) setSku(armarSku({ nombre: valor }));
  }

  function alCambiarMarca(valor: string) {
    setMarcaId(valor);
    if (!skuEditadoManualmente) setSku(armarSku({ marcaId: valor }));
  }

  function alCambiarVariante(valor: string) {
    setVariante(valor);
    if (!skuEditadoManualmente) setSku(armarSku({ variante: valor }));
  }

  return (
    <div className="space-y-3">
      <CampoImagen name="imagen" valorInicial={inicial?.imagen_url} />
      {inicial?.imagen_url && (
        <input type="hidden" name="imagen_url_previa" value={inicial.imagen_url} />
      )}

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Categoría</label>
          <CampoSugerencias
            name="categoria"
            required
            value={categoria}
            onChange={alCambiarCategoria}
            sugerencias={categorias}
            className={claseCampo}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Fábrica</label>
          <CampoSugerencias
            name="fabrica"
            value={fabrica}
            onChange={setFabrica}
            sugerencias={fabricas}
            className={claseCampo}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Proveedor / contacto</label>
          <CampoSugerencias
            name="proveedor"
            value={proveedor}
            onChange={setProveedor}
            sugerencias={proveedores}
            className={claseCampo}
          />
        </div>
      </div>

      {marcas.length === 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Marca y SKU nuevo (MARCA-PRODUCTO-VARIANTE) se activan al correr el SQL 0038 en Supabase. Mientras, el SKU se arma con la regla anterior.
        </p>
      )}
      {marcas.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Marca</label>
            <div className="mt-1">
              <Selector
                name="marca_id"
                defaultValue={marcaId}
                onChange={alCambiarMarca}
                opciones={marcas.map((m) => ({ value: m.id, label: `${m.nombre} (${m.codigo})` }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Variante (color, talla, medida — opcional)</label>
            <input
              type="text"
              name="variante"
              value={variante}
              onChange={(e) => alCambiarVariante(e.target.value)}
              placeholder="Ej. Gris, 10 kg, 120 cm"
              className={claseCampo}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Nombre del producto</label>
          <input
            type="text"
            name="nombre"
            required
            value={nombre}
            onChange={(e) => alCambiarNombre(e.target.value)}
            className={claseCampo}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">SKU (se arma solo: marca-producto-variante; edítalo si quieres)</label>
          <input
            type="text"
            name="sku"
            value={sku}
            onChange={(e) => {
              setSkuEditadoManualmente(true);
              setSku(e.target.value);
            }}
            className={`${claseCampo} font-mono`}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-500">Memo / detalles para el proveedor</label>
        <input
          type="text"
          name="memo"
          defaultValue={inicial?.memo ?? ""}
          placeholder="Color, código, comentario..."
          className={claseCampo}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Cantidad</label>
          {contenedorRecibido ? (
            <>
              <input
                type="text"
                value={inicial?.cantidad ?? 0}
                disabled
                className={`${claseCampo} cursor-not-allowed bg-zinc-100 text-zinc-400`}
              />
              <input type="hidden" name="cantidad" value={inicial?.cantidad ?? 0} />
              <p className="mt-1 text-[11px] text-zinc-400">
                Ya se recibió — usa &ldquo;Editar recepción&rdquo; para corregirla (esa sí ajusta el stock).
              </p>
            </>
          ) : (
            <CampoNumero
              name="cantidad"
              defaultValue={esRestock ? undefined : inicial?.cantidad}
              onChange={setCantidadTxt}
              className={claseCampo}
            />
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Precio USD</label>
          <CampoMonto name="precio_dolares" defaultValue={inicial?.precio_dolares} className={claseCampo} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Piezas por caja</label>
          <CampoNumero name="piezas_por_caja" defaultValue={inicial?.piezas_por_caja} onChange={setPiezasCajaTxt} className={claseCampo} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Largo (cm)</label>
          <CampoNumero name="largo_cm" defaultValue={inicial?.largo_cm} onChange={setLargoTxt} className={claseCampo} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Ancho (cm)</label>
          <CampoNumero name="ancho_cm" defaultValue={inicial?.ancho_cm} onChange={setAnchoTxt} className={claseCampo} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Alto (cm)</label>
          <CampoNumero name="alto_cm" defaultValue={inicial?.alto_cm} onChange={setAltoTxt} className={claseCampo} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Peso por pieza (kg)</label>
          <CampoNumero name="peso_kg" defaultValue={inicial?.peso_kg ?? undefined} onChange={setPesoTxt} className={claseCampo} />
        </div>
      </div>

      {(pesoLinea > 0 || cbmLinea > 0) && (
        <div className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          <p>
            Esta línea: <strong className="text-zinc-900">{Math.round(pesoLinea).toLocaleString("es-MX")} kg</strong> · {cbmLinea.toFixed(2)} m³
            {!pesoTxt && cantidadNum > 0 && <span className="text-amber-700"> · sin peso capturado</span>}
          </p>
          {ocupacion && (
            <p className="mt-0.5">
              Con ella el contenedor queda en{" "}
              <span className={`font-semibold ${colorPct(pctPeso)}`}>
                {Math.round(pesoDespues).toLocaleString("es-MX")} de {ocupacion.limitePesoKg.toLocaleString("es-MX")} kg ({Math.round(pctPeso)}%)
              </span>{" "}
              y{" "}
              <span className={`font-semibold ${colorPct(pctCbm)}`}>
                {cbmDespues.toFixed(1)} de {ocupacion.capacidadCbm} m³ ({Math.round(pctCbm)}%)
              </span>
              {pctPeso > 100 && <span className="text-red-700"> — te pasas de peso</span>}
              {pctPeso <= 100 && pctCbm > 100 && <span className="text-red-700"> — te pasas de espacio</span>}
              {pctPeso <= 100 && pctCbm <= 100 && (
                <span className="text-zinc-500">
                  {" "}
                  · te quedan {Math.round(ocupacion.limitePesoKg - pesoDespues).toLocaleString("es-MX")} kg y {(ocupacion.capacidadCbm - cbmDespues).toFixed(1)} m³
                </span>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

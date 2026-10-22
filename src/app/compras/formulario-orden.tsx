"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Selector } from "@/components/selector";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoMonto } from "@/components/campo-monto";
import { CampoSugerencias } from "@/components/campo-sugerencias";
import { BotonGuardar } from "@/components/boton-guardar";
import { SelectorProducto } from "@/app/stock/salidas/selector-producto";
import { formatoPesos } from "@/lib/formato";
import { skuLibre, skuNuevo, skuSugerido } from "@/lib/calculos";
import { ivaIncluido } from "@/lib/calculos-compras";
import { CONDICIONES_PAGO, IVA_PCT, type Bodega, type CondicionesPago, type OrdenCompra, type OrdenCompraLinea, type ProveedorMx } from "@/lib/tipos";
import { actualizarOrden, registrarOrden } from "./actions";

export interface OpcionProducto {
  sku: string;
  nombre: string;
  stockActual: number;
  piezasPorCaja: number;
  imagenUrl: string | null;
}

interface Linea {
  id: string;
  sku: string;
  nombre: string;
  imagenUrl: string | null;
  piezasPorCaja: number;
  cantidad: number;
  precioUnitario: number;
  nuevo: { marcaId: string | null; categoria: string | null } | null;
}

const NUEVO_PROVEEDOR = "__nuevo__";
const claseInput = "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

function aTexto(fecha: Date) {
  return fecha.toISOString().slice(0, 10);
}

/** Formulario de orden de compra (nueva o editar). Los precios se capturan
 * como los da el proveedor, CON IVA incluido (regla de Isaac, 22 oct); ese
 * es el costo que entra al stock. Un producto que no existe en el CRM se da
 * de alta aquí mismo con su foto. */
export function FormularioOrden({
  proveedores,
  bodegas,
  opciones,
  marcas,
  categorias,
  skusExistentes,
  ultimosPrecios,
  ultimoPrecioGlobal,
  proveedorInicial,
  inicial,
}: {
  proveedores: ProveedorMx[];
  bodegas: Bodega[];
  opciones: OpcionProducto[];
  marcas: { id: string; nombre: string; codigo: string }[];
  categorias: string[];
  skusExistentes: string[];
  /** Último precio por proveedor y SKU, para proponerlo ("como la última vez"). */
  ultimosPrecios: Record<string, Record<string, number>>;
  ultimoPrecioGlobal: Record<string, number>;
  proveedorInicial?: string | null;
  inicial?: { orden: OrdenCompra; lineas: OrdenCompraLinea[] };
}) {
  const router = useRouter();
  const hoyTexto = aTexto(new Date());
  const existentes = useMemo(() => new Set(skusExistentes), [skusExistentes]);

  const [proveedorId, setProveedorId] = useState(inicial?.orden.proveedor_id ?? proveedorInicial ?? (proveedores.length ? "" : NUEVO_PROVEEDOR));
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoTelefono, setNuevoTelefono] = useState("");
  const proveedorActual = proveedores.find((p) => p.id === proveedorId);
  const [fecha, setFecha] = useState(inicial ? inicial.orden.fecha.slice(0, 10) : hoyTexto);
  const [fechaEntrega, setFechaEntrega] = useState(inicial?.orden.fecha_entrega ? inicial.orden.fecha_entrega.slice(0, 10) : "");
  const [condiciones, setCondiciones] = useState<CondicionesPago>(inicial?.orden.condiciones_pago ?? proveedorActual?.condiciones_pago ?? "AL_RECIBIR");
  const [dias, setDias] = useState(String(inicial?.orden.dias_credito ?? proveedorActual?.dias_credito ?? ""));
  const [bodegaId, setBodegaId] = useState(inicial?.orden.bodega_id ?? bodegas[0]?.id ?? "");
  const [flete, setFlete] = useState(inicial?.orden.flete ? String(inicial.orden.flete) : "");
  const [notasProveedor, setNotasProveedor] = useState(inicial?.orden.notas_proveedor ?? "");
  const [notas, setNotas] = useState(inicial?.orden.notas ?? "");

  const [lineas, setLineas] = useState<Linea[]>(
    (inicial?.lineas ?? []).map((l) => ({ id: l.id, sku: l.sku, nombre: l.nombre, imagenUrl: l.imagen_url, piezasPorCaja: l.piezas_por_caja, cantidad: l.cantidad, precioUnitario: l.precio_unitario, nuevo: null })),
  );
  const [archivos, setArchivos] = useState<Map<string, File>>(new Map());

  // Renglón que se está armando: producto del catálogo o producto nuevo.
  const [modo, setModo] = useState<"CATALOGO" | "NUEVO">("CATALOGO");
  const [sku, setSku] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [precio, setPrecio] = useState("");
  const [nNombre, setNNombre] = useState("");
  const marcaDefecto = marcas.find((m) => m.codigo === "DAY") ?? marcas[0];
  const [nMarcaId, setNMarcaId] = useState(marcaDefecto?.id ?? "");
  const [nCategoria, setNCategoria] = useState("");
  const [nVariante, setNVariante] = useState("");
  const [nSkuManual, setNSkuManual] = useState<string | null>(null);
  const [nPiezasPorCaja, setNPiezasPorCaja] = useState("1");
  const [nFoto, setNFoto] = useState<File | null>(null);
  const [nFotoPrevia, setNFotoPrevia] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const opcionActual = opciones.find((o) => o.sku === sku);
  const skusEnLineas = useMemo(() => new Set(lineas.map((l) => l.sku)), [lineas]);
  const nMarca = marcas.find((m) => m.id === nMarcaId);
  const nSkuAuto = useMemo(() => {
    const base = nMarca ? skuNuevo(nMarca.codigo, nNombre, nVariante) : skuSugerido(nCategoria, nNombre);
    return base ? skuLibre(base, new Set([...existentes, ...skusEnLineas])) : "";
  }, [nMarca, nNombre, nVariante, nCategoria, existentes, skusEnLineas]);
  const nSku = (nSkuManual ?? nSkuAuto).toUpperCase();

  const precioPropuesto = (s: string) => ultimosPrecios[proveedorId]?.[s] ?? ultimoPrecioGlobal[s];

  const subtotal = lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);
  const fleteNum = Number(flete) || 0;
  const total = subtotal + fleteNum;
  const piezas = lineas.reduce((s, l) => s + l.cantidad, 0);

  function alElegirProveedor(id: string) {
    setProveedorId(id);
    const p = proveedores.find((x) => x.id === id);
    if (p) {
      setCondiciones(p.condiciones_pago);
      setDias(String(p.dias_credito ?? ""));
    }
  }

  function alElegirProducto(nuevoSku: string) {
    setSku(nuevoSku);
    const ultimo = precioPropuesto(nuevoSku);
    setPrecio(ultimo !== undefined ? String(ultimo) : "");
  }

  function limpiarRenglon() {
    setSku("");
    setCantidad("");
    setPrecio("");
    setNNombre("");
    setNVariante("");
    setNSkuManual(null);
    setNPiezasPorCaja("1");
    setNFoto(null);
    setNFotoPrevia(null);
  }

  function agregarLinea() {
    const cant = Number(cantidad);
    const precioNum = Number(precio);
    if (!(cant > 0)) {
      setError("Pon cuántas piezas vas a pedir.");
      return;
    }
    if (precio === "" || !Number.isFinite(precioNum) || precioNum < 0) {
      setError("Pon el precio por pieza que te da el proveedor (con IVA incluido).");
      return;
    }
    if (modo === "CATALOGO") {
      if (!opcionActual) {
        setError("Elige el producto.");
        return;
      }
      if (skusEnLineas.has(opcionActual.sku)) {
        setError(`"${opcionActual.nombre}" ya está en la orden: cámbiale la cantidad quitándolo y agregándolo de nuevo.`);
        return;
      }
      setLineas((prev) => [...prev, { id: crypto.randomUUID(), sku: opcionActual.sku, nombre: opcionActual.nombre, imagenUrl: opcionActual.imagenUrl, piezasPorCaja: opcionActual.piezasPorCaja || 1, cantidad: cant, precioUnitario: precioNum, nuevo: null }]);
    } else {
      if (!nNombre.trim()) {
        setError("Ponle nombre al producto nuevo.");
        return;
      }
      if (!nSku) {
        setError("El producto nuevo necesita un SKU.");
        return;
      }
      if (existentes.has(nSku) || skusEnLineas.has(nSku)) {
        setError(`El SKU ${nSku} ya existe: elígelo del catálogo o cambia el SKU.`);
        return;
      }
      if (nFoto) setArchivos((prev) => new Map(prev).set(nSku, nFoto));
      setLineas((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sku: nSku,
          nombre: nNombre.trim(),
          imagenUrl: nFotoPrevia,
          piezasPorCaja: Number(nPiezasPorCaja) > 0 ? Number(nPiezasPorCaja) : 1,
          cantidad: cant,
          precioUnitario: precioNum,
          nuevo: { marcaId: nMarcaId || null, categoria: nCategoria.trim() || null },
        },
      ]);
    }
    setError(null);
    limpiarRenglon();
  }

  function quitarLinea(id: string) {
    setLineas((prev) => prev.filter((l) => l.id !== id));
  }

  async function guardar() {
    if (lineas.length === 0) {
      setError("Agrega al menos un producto a la orden.");
      return;
    }
    if (proveedorId === NUEVO_PROVEEDOR && !nuevoNombre.trim()) {
      setError("Escribe el nombre del proveedor nuevo.");
      return;
    }
    setEnviando(true);
    setError(null);
    const fd = new FormData();
    if (proveedorId === NUEVO_PROVEEDOR) {
      fd.set("nuevo_proveedor_nombre", nuevoNombre.trim());
      fd.set("nuevo_proveedor_telefono", nuevoTelefono.trim());
    } else {
      fd.set("proveedor_id", proveedorId);
    }
    fd.set("bodega_id", bodegaId);
    fd.set("fecha", fecha);
    fd.set("fecha_entrega", fechaEntrega);
    fd.set("condiciones_pago", condiciones);
    fd.set("dias_credito", dias);
    fd.set("flete", flete);
    fd.set("notas_proveedor", notasProveedor);
    fd.set("notas", notas);
    fd.set(
      "lineas",
      JSON.stringify(lineas.map((l) => ({ sku: l.sku, nombre: l.nombre, imagenUrl: l.nuevo ? null : l.imagenUrl, piezasPorCaja: l.piezasPorCaja, cantidad: l.cantidad, precioUnitario: l.precioUnitario, nuevo: l.nuevo }))),
    );
    for (const l of lineas) {
      const archivo = l.nuevo ? archivos.get(l.sku) : undefined;
      if (archivo) fd.set(`imagen_${l.sku}`, archivo);
    }
    let destino: string | null = null;
    if (inicial) {
      const r = await actualizarOrden(inicial.orden.id, fd);
      if (r.error) {
        setEnviando(false);
        setError(r.error);
        return;
      }
      destino = inicial.orden.id;
    } else {
      const r = await registrarOrden(fd);
      if (r.error || !r.id) {
        setEnviando(false);
        setError(r.error ?? "No se pudo guardar la orden.");
        return;
      }
      destino = r.id;
    }
    router.push(`/compras/${destino}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* 1. Proveedor y fechas */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-zinc-900">Proveedor</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className="block text-xs font-medium text-zinc-500">¿A quién le compras?</label>
            <div className="mt-1">
              <Selector
                defaultValue={proveedorId}
                onChange={alElegirProveedor}
                placeholder="Elige un proveedor"
                opciones={[...proveedores.map((p) => ({ value: p.id, label: p.nombre })), { value: NUEVO_PROVEEDOR, label: "+ Proveedor nuevo" }]}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Fecha de la orden</label>
            <div className="mt-1">
              <CampoFecha defaultValue={fecha} onChange={setFecha} max={hoyTexto} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">¿Para cuándo te la entregan?</label>
            <div className="mt-1">
              <CampoFecha defaultValue={fechaEntrega} onChange={setFechaEntrega} />
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">Opcional. Con fecha, te aviso si se atrasa.</p>
          </div>
          {proveedorId === NUEVO_PROVEEDOR && (
            <>
              <div>
                <label className="block text-xs font-medium text-zinc-500">Nombre del proveedor nuevo</label>
                <input type="text" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Ej. Plásticos del Norte" className={claseInput} />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500">Teléfono / WhatsApp (opcional)</label>
                <input type="text" value={nuevoTelefono} onChange={(e) => setNuevoTelefono(e.target.value)} className={claseInput} />
              </div>
              <p className="self-end text-[11px] text-zinc-400 sm:pb-2">Los demás datos los completas después en Proveedores.</p>
            </>
          )}
        </div>
      </div>

      {/* 2. Productos */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-900">Productos</h3>
          <div className="flex gap-1 rounded-full bg-zinc-100 p-0.5 text-xs">
            {(
              [
                ["CATALOGO", "Del catálogo"],
                ["NUEVO", "+ Producto nuevo"],
              ] as const
            ).map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                onClick={() => {
                  setModo(valor);
                  setError(null);
                }}
                className={`rounded-full px-3 py-1 font-medium transition ${modo === valor ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"}`}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        </div>

        {modo === "CATALOGO" ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
            <div>
              <label className="block text-xs font-medium text-zinc-500">Producto</label>
              <SelectorProducto opciones={opciones} value={sku} onChange={alElegirProducto} />
              {opcionActual && (
                <p className="mt-1 text-[11px] text-zinc-400">
                  {opcionActual.stockActual.toLocaleString("es-MX")} en bodega · <span className="font-mono">{opcionActual.sku}</span>
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Cantidad (piezas)</label>
              <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={claseInput} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Precio por pieza (IVA incluido)</label>
              <div className="mt-1">
                <CampoMonto value={precio} onChange={setPrecio} placeholder="0" />
              </div>
              {sku && precioPropuesto(sku) !== undefined && (
                <p className="mt-1 text-[11px] text-emerald-700">
                  {ultimosPrecios[proveedorId]?.[sku] !== undefined ? "Con este proveedor la última vez" : "Última vez"}: {formatoPesos(precioPropuesto(sku)!)}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <p className="text-xs text-emerald-900">Este producto se da de alta en el CRM con su foto y su SKU al guardar la orden; al recibirlo entra al stock con este costo.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr_1fr]">
              <label className="flex aspect-square w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-zinc-300 bg-white text-center text-[11px] text-zinc-500 hover:border-zinc-400">
                {nFotoPrevia ? (
                  // eslint-disable-next-line @next/next/no-img-element -- previsualización local
                  <img src={nFotoPrevia} alt="" className="h-full w-full rounded-lg object-cover" />
                ) : (
                  <>
                    <span className="text-lg">+</span>
                    <span>Foto</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const archivo = e.target.files?.[0] ?? null;
                    setNFoto(archivo);
                    setNFotoPrevia(archivo ? URL.createObjectURL(archivo) : null);
                  }}
                />
              </label>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-500">Nombre del producto</label>
                  <input type="text" value={nNombre} onChange={(e) => setNNombre(e.target.value)} placeholder="Ej. Tapete de yoga" className={claseInput} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {marcas.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-zinc-500">Marca</label>
                      <div className="mt-1">
                        <Selector defaultValue={nMarcaId} onChange={setNMarcaId} opciones={marcas.map((m) => ({ value: m.id, label: `${m.nombre} (${m.codigo})` }))} />
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-zinc-500">Categoría</label>
                    <CampoSugerencias value={nCategoria} onChange={setNCategoria} sugerencias={categorias} placeholder="Gym, Hogar…" className={claseInput} />
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500">Variante (opcional)</label>
                    <input type="text" value={nVariante} onChange={(e) => setNVariante(e.target.value)} placeholder="Gris, 10 kg…" className={claseInput} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500">SKU</label>
                    <input type="text" value={nSku} onChange={(e) => setNSkuManual(e.target.value)} className={`${claseInput} font-mono`} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500">Pzas/caja</label>
                    <input type="number" min={1} value={nPiezasPorCaja} onChange={(e) => setNPiezasPorCaja(e.target.value)} className={claseInput} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500">Cantidad</label>
                    <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={claseInput} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500">Precio/pza</label>
                    <div className="mt-1">
                      <CampoMonto value={precio} onChange={setPrecio} placeholder="0" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={agregarLinea} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700">
            + Agregar a la orden
          </button>
        </div>

        {lineas.length > 0 && (
          <div className="mt-4 divide-y divide-zinc-100 rounded-xl border border-zinc-200">
            {lineas.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {l.imagenUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura chica en una lista
                    <img src={l.imagenUrl} alt={l.nombre} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="h-10 w-10 shrink-0 rounded-lg bg-zinc-100" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">
                      {l.nombre}
                      {l.nuevo && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">nuevo</span>}
                    </p>
                    <p className="text-xs text-zinc-400">
                      <span className="font-mono">{l.sku}</span> · {l.cantidad.toLocaleString("es-MX")} × {formatoPesos(l.precioUnitario)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold text-zinc-900">{formatoPesos(l.cantidad * l.precioUnitario)}</span>
                  <button type="button" onClick={() => quitarLinea(l.id)} className="text-zinc-400 hover:text-red-600" aria-label="Quitar producto">
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Pago y entrega */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-zinc-900">Pago y entrega</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500">¿Cómo te cobra?</label>
            <div className="mt-1">
              <Selector key={condiciones} defaultValue={condiciones} onChange={(v) => setCondiciones(v as CondicionesPago)} opciones={CONDICIONES_PAGO.map((c) => ({ value: c.valor, label: c.etiqueta }))} />
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">{CONDICIONES_PAGO.find((c) => c.valor === condiciones)?.descripcion}</p>
          </div>
          {condiciones === "CREDITO" ? (
            <div>
              <label className="block text-xs font-medium text-zinc-500">Días de crédito</label>
              <input type="number" min={1} value={dias} onChange={(e) => setDias(e.target.value)} placeholder="Ej. 30" className={claseInput} />
              <p className="mt-1 text-[11px] text-zinc-400">Cuentan desde que recibes la mercancía.</p>
            </div>
          ) : (
            <div />
          )}
          <div>
            <label className="block text-xs font-medium text-zinc-500">Llega a la bodega</label>
            <div className="mt-1">
              <Selector defaultValue={bodegaId} onChange={setBodegaId} opciones={bodegas.map((b) => ({ value: b.id, label: b.nombre }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Flete u otros gastos (opcional)</label>
            <div className="mt-1">
              <CampoMonto value={flete} onChange={setFlete} placeholder="0" />
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">Con IVA incluido. Se reparte entre las piezas en el costo.</p>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-zinc-500">Instrucciones para el proveedor (salen en la orden)</label>
            <input type="text" value={notasProveedor} onChange={(e) => setNotasProveedor(e.target.value)} placeholder="Ej. Entregar de 9 a 2, preguntar por Juan" className={claseInput} />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-zinc-500">Notas internas (opcional, no salen en la orden)</label>
            <input type="text" value={notas} onChange={(e) => setNotas(e.target.value)} className={claseInput} />
          </div>
        </div>
      </div>

      {/* 4. Totales */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-zinc-500">Mercancía ({piezas.toLocaleString("es-MX")} pzas)</dt>
            <dd className="text-zinc-900">{formatoPesos(subtotal)}</dd>
          </div>
          {fleteNum > 0 && (
            <div className="flex justify-between">
              <dt className="text-zinc-500">Flete u otros gastos</dt>
              <dd className="text-zinc-900">{formatoPesos(fleteNum)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-zinc-100 pt-2 text-base">
            <dt className="font-semibold text-zinc-900">Total</dt>
            <dd className="font-semibold text-zinc-900">{formatoPesos(total)}</dd>
          </div>
          {total > 0 && (
            <div className="flex justify-between text-xs">
              <dt className="text-zinc-400">IVA incluido en ese total ({IVA_PCT}%), si te dan factura</dt>
              <dd className="text-zinc-400">{formatoPesos(ivaIncluido(total))}</dd>
            </div>
          )}
        </dl>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end">
          <BotonGuardar cargando={enviando} mostrarListo={false} onClick={guardar} textoCargando="Guardando…" className="rounded-xl bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700">
            {inicial ? "Guardar cambios" : "Registrar orden de compra"}
          </BotonGuardar>
        </div>
      </div>
    </div>
  );
}

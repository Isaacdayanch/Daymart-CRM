"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Selector } from "@/components/selector";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoMonto } from "@/components/campo-monto";
import { formatoPesos } from "@/lib/formato";
import { FORMAS_PAGO_VENTA, IVA_PCT, type Bodega, type Cliente, type CuentaFinanciera, type FormaPagoVenta } from "@/lib/tipos";
import { SelectorProducto } from "@/app/stock/salidas/selector-producto";
import { registrarVenta } from "../actions";

interface Opcion {
  sku: string;
  nombre: string;
  stockActual: number;
  piezasPorCaja: number;
  imagenUrl: string | null;
  costoPromedio: number;
}

interface Linea extends Opcion {
  id: string;
  cantidad: number;
  precioUnitario: number;
}

const NUEVO_CLIENTE = "__nuevo__";
const DIAS_CREDITO_DEFECTO = 30;

function aTexto(fecha: Date) {
  return fecha.toISOString().slice(0, 10);
}

function sumarDias(fechaTexto: string, dias: number) {
  const fecha = new Date(`${fechaTexto}T12:00:00`);
  fecha.setDate(fecha.getDate() + dias);
  return aTexto(fecha);
}

export function FormularioVenta({
  opciones,
  clientes,
  bodegas,
  cuentas,
  ultimoPrecioPorSku,
}: {
  opciones: Opcion[];
  clientes: Cliente[];
  bodegas: Bodega[];
  cuentas: CuentaFinanciera[];
  ultimoPrecioPorSku: Record<string, number>;
}) {
  const router = useRouter();
  const hoyTexto = aTexto(new Date());

  const [clienteId, setClienteId] = useState(clientes.length ? "" : NUEVO_CLIENTE);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoTelefono, setNuevoTelefono] = useState("");
  const [fecha, setFecha] = useState(hoyTexto);
  const [bodegaId, setBodegaId] = useState(bodegas[0]?.id ?? "");

  const [lineas, setLineas] = useState<Linea[]>([]);
  const [sku, setSku] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [precio, setPrecio] = useState("");

  const [conIva, setConIva] = useState(false);
  const [formaPago, setFormaPago] = useState<FormaPagoVenta>("CONTADO");
  const [cuentaId, setCuentaId] = useState(cuentas[0]?.id ?? "");
  const [fechaLimite, setFechaLimite] = useState(sumarDias(hoyTexto, DIAS_CREDITO_DEFECTO));
  const [notas, setNotas] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const opcionActual = opciones.find((o) => o.sku === sku);
  const clienteActual = clientes.find((c) => c.id === clienteId);

  const subtotal = lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);
  const iva = conIva ? subtotal * (IVA_PCT / 100) : 0;
  const total = subtotal + iva;
  const costo = lineas.reduce((s, l) => s + l.cantidad * l.costoPromedio, 0);
  const margen = subtotal - costo;

  function alElegirProducto(nuevoSku: string) {
    setSku(nuevoSku);
    const ultimo = ultimoPrecioPorSku[nuevoSku];
    setPrecio(ultimo !== undefined ? String(ultimo) : "");
  }

  function alElegirCliente(id: string) {
    setClienteId(id);
    const cliente = clientes.find((c) => c.id === id);
    setFechaLimite(sumarDias(fecha, cliente?.dias_credito ?? DIAS_CREDITO_DEFECTO));
  }

  function alCambiarFecha(nueva: string) {
    setFecha(nueva);
    setFechaLimite(sumarDias(nueva, clienteActual?.dias_credito ?? DIAS_CREDITO_DEFECTO));
  }

  function agregarLinea() {
    const cant = Number(cantidad);
    const precioNum = Number(precio);
    if (!opcionActual || !(cant > 0)) {
      setError("Elige el producto y una cantidad válida.");
      return;
    }
    if (!Number.isFinite(precioNum) || precioNum < 0 || precio === "") {
      setError("Ponle precio de venta por pieza a este producto.");
      return;
    }
    const yaPedido = lineas.filter((l) => l.sku === opcionActual.sku).reduce((s, l) => s + l.cantidad, 0);
    if (yaPedido + cant > opcionActual.stockActual) {
      setError(`Solo tienes ${opcionActual.stockActual} piezas de "${opcionActual.nombre}" en stock.`);
      return;
    }
    setError(null);
    setLineas((prev) => [...prev, { ...opcionActual, id: crypto.randomUUID(), cantidad: cant, precioUnitario: precioNum }]);
    setSku("");
    setCantidad("1");
    setPrecio("");
  }

  function quitarLinea(id: string) {
    setLineas((prev) => prev.filter((l) => l.id !== id));
  }

  async function guardar() {
    if (lineas.length === 0) {
      setError("Agrega al menos un producto a la venta.");
      return;
    }
    setEnviando(true);
    setError(null);
    const formData = new FormData();
    if (clienteId === NUEVO_CLIENTE) {
      formData.set("nuevo_cliente_nombre", nuevoNombre);
      formData.set("nuevo_cliente_telefono", nuevoTelefono);
    } else {
      formData.set("cliente_id", clienteId);
    }
    formData.set("bodega_id", bodegaId);
    formData.set("fecha", fecha);
    formData.set("forma_pago", formaPago);
    formData.set("con_iva", conIva ? "true" : "false");
    formData.set("cuenta_id", cuentaId);
    formData.set("fecha_limite", fechaLimite);
    formData.set("notas", notas);
    formData.set(
      "lineas",
      JSON.stringify(
        lineas.map((l) => ({
          sku: l.sku,
          nombre: l.nombre,
          imagenUrl: l.imagenUrl,
          piezasPorCaja: l.piezasPorCaja,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
        })),
      ),
    );
    const resultado = await registrarVenta(formData);
    if (resultado.error || !resultado.id) {
      setEnviando(false);
      setError(resultado.error ?? "No se pudo guardar la venta.");
      return;
    }
    router.push(`/ventas/${resultado.id}`);
  }

  const claseInput =
    "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

  return (
    <div className="space-y-4">
      {/* 1. Cliente y fecha */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-zinc-900">Cliente</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-zinc-500">¿A quién le vendes?</label>
            <div className="mt-1">
              <Selector
                defaultValue={clienteId}
                onChange={alElegirCliente}
                placeholder="Elige un cliente"
                opciones={[
                  ...clientes.map((c) => ({ value: c.id, label: c.nombre })),
                  { value: NUEVO_CLIENTE, label: "+ Cliente nuevo" },
                ]}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Fecha de la venta</label>
            <div className="mt-1">
              <CampoFecha defaultValue={fecha} onChange={alCambiarFecha} max={hoyTexto} />
            </div>
          </div>
          {clienteId === NUEVO_CLIENTE && (
            <>
              <div>
                <label className="block text-xs font-medium text-zinc-500">Nombre del cliente nuevo</label>
                <input
                  type="text"
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  placeholder="Ej. Ferretería López"
                  className={claseInput}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500">Teléfono (opcional)</label>
                <input
                  type="text"
                  value={nuevoTelefono}
                  onChange={(e) => setNuevoTelefono(e.target.value)}
                  className={claseInput}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* 2. Productos */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-zinc-900">Productos</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Producto</label>
            <SelectorProducto opciones={opciones} value={sku} onChange={alElegirProducto} />
            {opcionActual && (
              <p className="mt-1 text-[11px] text-zinc-400">
                {opcionActual.stockActual} en stock
                {opcionActual.costoPromedio > 0 && <> · te costó {formatoPesos(opcionActual.costoPromedio)}/pza</>}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Cantidad</label>
            <input
              type="number"
              min={1}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className={claseInput}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Precio por pieza (sin IVA)</label>
            <div className="mt-1">
              <CampoMonto value={precio} onChange={setPrecio} placeholder="0" />
            </div>
            {sku && ultimoPrecioPorSku[sku] !== undefined && (
              <p className="mt-1 text-[11px] text-zinc-400">Última vez: {formatoPesos(ultimoPrecioPorSku[sku])}</p>
            )}
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={agregarLinea}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
          >
            + Agregar a la venta
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
                    <p className="truncate text-sm font-medium text-zinc-900">{l.nombre}</p>
                    <p className="text-xs text-zinc-400">
                      {l.cantidad} × {formatoPesos(l.precioUnitario)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold text-zinc-900">{formatoPesos(l.cantidad * l.precioUnitario)}</span>
                  <button
                    type="button"
                    onClick={() => quitarLinea(l.id)}
                    className="text-zinc-400 hover:text-red-600"
                    aria-label="Quitar producto"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Cobro */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-zinc-900">Cobro</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Forma de pago</label>
            <div className="mt-1">
              <Selector
                defaultValue={formaPago}
                onChange={(v) => setFormaPago(v as FormaPagoVenta)}
                opciones={FORMAS_PAGO_VENTA.map((f) => ({ value: f.valor, label: f.etiqueta }))}
              />
            </div>
          </div>
          {formaPago === "CONTADO" ? (
            <div>
              <label className="block text-xs font-medium text-zinc-500">¿A qué cuenta entra el dinero?</label>
              <div className="mt-1">
                <Selector
                  defaultValue={cuentaId}
                  onChange={setCuentaId}
                  placeholder="Elige la cuenta"
                  opciones={cuentas.map((c) => ({ value: c.id, label: c.nombre }))}
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-zinc-500">¿Para cuándo te paga?</label>
              <div className="mt-1">
                <CampoFecha key={fechaLimite} defaultValue={fechaLimite} onChange={setFechaLimite} />
              </div>
              <p className="mt-1 text-[11px] text-zinc-400">
                {clienteActual?.dias_credito
                  ? `${clienteActual.dias_credito} días de crédito de este cliente.`
                  : `Propuesto a ${DIAS_CREDITO_DEFECTO} días; cámbialo si acordaron otra fecha.`}
              </p>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-zinc-500">Sale de la bodega</label>
            <div className="mt-1">
              <Selector
                defaultValue={bodegaId}
                onChange={setBodegaId}
                opciones={bodegas.map((b) => ({ value: b.id, label: b.nombre }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Notas (opcional)</label>
            <input
              type="text"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Cualquier dato extra"
              className={claseInput}
            />
          </div>
        </div>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={conIva}
            onChange={(e) => setConIva(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
          />
          Agregar IVA ({IVA_PCT}%) a esta venta
        </label>
      </div>

      {/* 4. Totales */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-zinc-500">Subtotal</dt>
            <dd className="text-zinc-900">{formatoPesos(subtotal)}</dd>
          </div>
          {conIva && (
            <div className="flex justify-between">
              <dt className="text-zinc-500">IVA ({IVA_PCT}%)</dt>
              <dd className="text-zinc-900">{formatoPesos(iva)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-zinc-100 pt-2 text-base">
            <dt className="font-semibold text-zinc-900">Total</dt>
            <dd className="font-semibold text-zinc-900">{formatoPesos(total)}</dd>
          </div>
          {lineas.length > 0 && (
            <div className="flex justify-between pt-1 text-xs">
              <dt className="text-zinc-400">Ganancia estimada (sin IVA, al costo promedio actual)</dt>
              <dd className={margen >= 0 ? "text-emerald-600" : "text-red-600"}>
                {formatoPesos(margen)}
                {subtotal > 0 && ` (${((margen / subtotal) * 100).toFixed(0)}%)`}
              </dd>
            </div>
          )}
        </dl>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={enviando}
            onClick={guardar}
            className="rounded-xl bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 disabled:opacity-50"
          >
            {enviando ? "Guardando..." : formaPago === "CONTADO" ? "Registrar venta y cobro" : "Registrar venta a crédito"}
          </button>
        </div>
      </div>
    </div>
  );
}

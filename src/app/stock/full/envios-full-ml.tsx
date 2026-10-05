"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatoFechaHoraMx } from "@/lib/fechas-mx";
import { ETIQUETA_ESTADO_ENVIO_ML, type EnvioFullMl, type LineaAgrupada } from "@/lib/mercadolibre-envios-full";
import { Selector } from "@/components/selector";
import { CampoFecha } from "@/components/campo-fecha";
import { buscarEnvioMl, confirmarEnvioMl, deshacerConfirmacionMl, ignorarEnvioMl, probarEnvioMl, sincronizarEnviosFullAhora } from "./actions";

export interface LineaParaPantalla extends LineaAgrupada {
  /** Producto del CRM resuelto por la liga (null = sin ligar). */
  sku: string | null;
  nombreCrm: string | null;
  stockBodega: number | null;
  piezasPorCaja: number | null;
}

export interface EnvioParaPantalla {
  envio: EnvioFullMl;
  lineas: LineaParaPantalla[];
}

const btnSec = "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50";

function colorEstado(estado: EnvioFullMl["estado"]) {
  if (estado === "RECIBIDO" || estado === "CONTADO") return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (estado === "CANCELADO") return "bg-red-50 text-red-700 ring-red-600/20";
  if (estado === "COLECTADO") return "bg-[#2D3277]/5 text-[#2D3277] ring-[#2D3277]/20";
  return "bg-amber-50 text-amber-700 ring-amber-600/20";
}

export function BotonActualizarEnviosMl({ conectado }: { conectado: boolean }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={cargando || !conectado}
        onClick={async () => {
          setCargando(true);
          setMensaje(null);
          const r = await sincronizarEnviosFullAhora();
          setCargando(false);
          setMensaje(
            r.error
              ? `Error: ${r.error}`
              : r.envios === 0
                ? `Se revisaron ${r.revisados ?? 0} de ${r.totalInventarios ?? 0} inventarios y no apareció ningún envío — abajo está el diagnóstico (mándame captura). Vuelve a darle para seguir con la siguiente tanda.`
                : `Listo: ${r.envios} envío(s) leídos (${r.revisados ?? 0} de ${r.totalInventarios ?? 0} inventarios en esta tanda)${r.recibidosNuevos ? `, ${r.recibidosNuevos} recibido(s) nuevo(s)` : ""}.`,
          );
          router.refresh();
        }}
        className={btnSec}
      >
        {cargando ? "Leyendo envíos de ML…" : "Actualizar envíos desde Mercado Libre"}
      </button>
      {mensaje && <span className={`text-xs ${mensaje.startsWith("Error") ? "text-red-600" : "text-emerald-700"}`}>{mensaje}</span>}
    </div>
  );
}

/** Buscador por número de envío (plan B de Isaac): pega el número de su
 * panel de ML y desde cuándo empezó a llegar; el sistema arma el envío con
 * los productos que subieron en Full desde esa fecha y lo deja listo para
 * revisar y confirmar. */
export function BuscarEnvioMl() {
  const router = useRouter();
  const hoy = new Date();
  const hace14 = new Date(hoy.getTime() - 14 * 86400000).toISOString().slice(0, 10);
  const [numero, setNumero] = useState("");
  const [desde, setDesde] = useState(hace14);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setCargando(true);
        setError(null);
        setMensaje(null);
        const r = await buscarEnvioMl(numero, desde);
        setCargando(false);
        if (r.error) setError(r.error);
        else if (r.productos === 0) setMensaje(`Se creó el envío ${numero.trim()}, pero Mercado Libre no ha reportado subidas de stock en Full desde esa fecha. Dale a "Actualizar desde Mercado Libre" en Publicaciones y vuelve a buscar, o cambia la fecha.`);
        else {
          setMensaje(`Listo: el envío ${numero.trim()} quedó abajo con ${r.productos} producto(s) y ${r.piezas} piezas que subieron en Full. Revísalo y confirma.`);
          setNumero("");
        }
        router.refresh();
      }}
      className="rounded-2xl border border-[#2D3277]/20 bg-[#2D3277]/5 p-4 sm:p-5"
    >
      <p className="text-sm font-semibold text-zinc-900">Buscar un envío por su número</p>
      <p className="mt-0.5 text-xs text-zinc-600">
        Pega el número tal como sale en tu panel de Mercado Libre (“Gestión de envíos Full”) y desde qué día empezó a llegar. Te armo el envío con los productos que subieron en Full desde esa fecha; tú revisas las piezas y confirmas la salida de bodega.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[11px] font-medium text-zinc-500">Número de envío</label>
          <input type="text" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="77396369" required className="mt-1 w-44 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-zinc-500">Empezó a llegar desde</label>
          <div className="mt-1 w-44">
            <CampoFecha name="desde" defaultValue={hace14} max={hoy.toISOString().slice(0, 10)} onChange={setDesde} />
          </div>
        </div>
        <button type="submit" disabled={cargando || !numero.trim()} className="rounded-xl bg-[#2D3277] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#232860] disabled:opacity-50">
          {cargando ? "Armando…" : "Buscar envío"}
        </button>
      </div>
      {mensaje && <p className="mt-2 text-xs text-emerald-700">{mensaje}</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </form>
  );
}

/** Diagnóstico: probar un número de envío real del panel de ML por todos
 * los caminos conocidos y ver qué contesta cada uno. */
export function ProbarEnvioMl() {
  const [numero, setNumero] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultados, setResultados] = useState<{ ruta: string; resultado: string; muestra?: string }[]>([]);
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
      <p className="font-medium text-zinc-900">Probar con un número de envío de tu panel de Mercado Libre</p>
      <p className="mt-0.5 text-xs text-zinc-500">Escribe el número tal como sale en “Gestión de envíos Full” (ej. 77396369). Le pregunto a ML por ese envío por todos los caminos y te muestro qué contesta cada uno; mándame captura.</p>
      <form
        className="mt-2 flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setCargando(true);
          setError(null);
          const r = await probarEnvioMl(numero);
          setCargando(false);
          if (r.error) setError(r.error);
          setResultados(r.resultados);
        }}
      >
        <input type="text" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="77396369" className="w-44 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm" />
        <button type="submit" disabled={cargando} className={btnSec}>
          {cargando ? "Preguntando a ML…" : "Probar"}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </form>
      {resultados.length > 0 && (
        <ul className="mt-3 space-y-2 font-mono text-[11px]">
          {resultados.map((r) => (
            <li key={r.ruta} className={`rounded-lg border p-2 ${r.resultado.startsWith("ok") ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>
              <p className="break-all">
                {r.ruta} → {r.resultado}
              </p>
              {r.muestra && <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[10px] text-emerald-800">{r.muestra}</pre>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Un envío a Full de Mercado Libre: estatus, productos y, si ML ya lo
 * recibió, el botón para confirmar la salida de bodega. */
export function TarjetaEnvioMl({ datos, bodegas }: { datos: EnvioParaPantalla; bodegas: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const { envio, lineas } = datos;
  const porConfirmar = (envio.estado === "RECIBIDO" || envio.estado === "CONTADO") && !envio.confirmado_en && !envio.ignorado_en;
  const [abierto, setAbierto] = useState(false);
  const [cantidades, setCantidades] = useState<Record<string, string>>(() => Object.fromEntries(lineas.map((l) => [l.clave, String(l.recibidas || l.planeadas || 0)])));
  const [incluir, setIncluir] = useState<Record<string, boolean>>(() => Object.fromEntries(lineas.map((l) => [l.clave, Boolean(l.sku)])));
  const [bodegaId, setBodegaId] = useState(bodegas[0]?.id ?? "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const sinLigar = lineas.filter((l) => !l.sku).length;
  const totalRecibidas = lineas.reduce((s, l) => s + l.recibidas, 0);
  const totalPlaneadas = lineas.reduce((s, l) => s + (l.planeadas ?? 0), 0);
  const seleccion = lineas.filter((l) => incluir[l.clave] && l.sku && Number(cantidades[l.clave]) > 0);
  const piezasSeleccion = seleccion.reduce((s, l) => s + (Number(cantidades[l.clave]) || 0), 0);

  return (
    <details open={porConfirmar} className={`group rounded-2xl border bg-white shadow-sm ${porConfirmar ? "border-emerald-300 ring-2 ring-emerald-100" : "border-zinc-200"}`}>
      <summary className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="inline-block transition-transform group-open:rotate-90">▸</span>
          <div>
            <p className="text-sm font-medium text-zinc-900">
              Envío a Full <span className="font-mono">{envio.inbound_id}</span>
              {envio.fecha_creacion && <span className="ml-2 text-xs font-normal text-zinc-400">creado {formatoFechaHoraMx(envio.fecha_creacion)}</span>}
            </p>
            <p className="text-xs text-zinc-400">
              {lineas.length} producto(s)
              {totalPlaneadas > 0 && <> · {totalPlaneadas.toLocaleString("es-MX")} piezas planeadas</>}
              {totalRecibidas > 0 && <> · <span className="text-emerald-700">{totalRecibidas.toLocaleString("es-MX")} recibidas por ML</span></>}
              {envio.fecha_recepcion && <> · recibido {formatoFechaHoraMx(envio.fecha_recepcion)}</>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {envio.confirmado_en && <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">salida confirmada {formatoFechaHoraMx(envio.confirmado_en)}</span>}
          {envio.ignorado_en && <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-500">no salió de bodega</span>}
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${colorEstado(envio.estado)}`} title={envio.estado_ml ?? ""}>
            {ETIQUETA_ESTADO_ENVIO_ML[envio.estado]}
            {envio.estado_ml && envio.estado === "DESCONOCIDO" ? ` (${envio.estado_ml})` : ""}
          </span>
        </div>
      </summary>
      <div className="border-t border-zinc-100 px-5 py-3">
        {lineas.length === 0 && <p className="text-xs text-zinc-400">Mercado Libre no reportó productos en este envío todavía.</p>}
        <ul className="divide-y divide-zinc-50">
          {lineas.map((l) => (
            <li key={l.clave} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
              <div className="flex items-center gap-3">
                {abierto && porConfirmar && <input type="checkbox" checked={Boolean(incluir[l.clave]) && Boolean(l.sku)} disabled={!l.sku} onChange={(e) => setIncluir((x) => ({ ...x, [l.clave]: e.target.checked }))} />}
                {l.imagen_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- miniatura de ML
                  <img src={l.imagen_url} alt="" className="h-9 w-9 rounded-lg object-cover" />
                ) : (
                  <div className="h-9 w-9 rounded-lg bg-zinc-100" />
                )}
                <div>
                  <p className="text-zinc-900">{l.titulo ?? l.item_id ?? l.inventory_id ?? "Producto"}</p>
                  <p className="text-xs text-zinc-400">
                    {l.item_id && <span className="font-mono">{l.item_id}</span>}
                    {l.seller_sku && <> · SKU ML {l.seller_sku}</>}
                    {" · "}
                    {l.sku ? (
                      <span className="text-zinc-600">
                        CRM: <span className="font-mono">{l.sku}</span>
                        {l.stockBodega !== null && <> · {l.stockBodega.toLocaleString("es-MX")} en bodega</>}
                      </span>
                    ) : (
                      <Link href={`/mercadolibre/stock?filtro=sinligar${l.item_id ? `&q=${encodeURIComponent(l.item_id)}` : ""}`} className="text-amber-700 underline-offset-2 hover:underline">
                        sin ligar con un producto del CRM → ligar
                      </Link>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                {l.planeadas !== null && (
                  <span className="text-zinc-500">
                    planeadas <strong className="text-zinc-900">{l.planeadas}</strong>
                  </span>
                )}
                <span className="text-zinc-500">
                  recibidas <strong className="text-emerald-700">{l.recibidas}</strong>
                </span>
                {abierto && porConfirmar && (
                  <label className="flex items-center gap-1 text-zinc-600">
                    salen
                    <input type="number" min={0} value={cantidades[l.clave] ?? ""} onChange={(e) => setCantidades((x) => ({ ...x, [l.clave]: e.target.value }))} disabled={!l.sku} className="w-20 rounded-lg border border-zinc-300 px-2 py-1 text-sm" />
                  </label>
                )}
              </div>
            </li>
          ))}
        </ul>

        {porConfirmar && !abierto && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setAbierto(true)} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700">
              Confirmar salida de bodega
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm("¿Este envío NO salió de tu bodega (ej. una devolución que llegó a Full)? No se descuenta nada.")) return;
                const r = await ignorarEnvioMl(envio.inbound_id);
                if (r.error) setError(r.error);
                router.refresh();
              }}
              className={btnSec}
            >
              No salió de mi bodega
            </button>
            {sinLigar > 0 && <span className="text-xs text-amber-700">{sinLigar} producto(s) sin ligar: ligarlos primero para que salgan de bodega.</span>}
          </div>
        )}
        {porConfirmar && abierto && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
            <p className="text-xs text-zinc-700">
              Van a salir de tu bodega <strong>{piezasSeleccion.toLocaleString("es-MX")} piezas</strong> de {seleccion.length} producto(s), con destino Full. Si ML recibió menos de lo que mandaste, corrige “salen” con lo que de verdad se fue.
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              {bodegas.length > 1 && (
                <div className="w-48">
                  <label className="block text-[11px] font-medium text-zinc-500">Bodega</label>
                  <Selector defaultValue={bodegaId} onChange={setBodegaId} opciones={bodegas.map((b) => ({ value: b.id, label: b.nombre }))} />
                </div>
              )}
              <button
                type="button"
                disabled={enviando || seleccion.length === 0}
                onClick={async () => {
                  if (!window.confirm(`¿Descontar ${piezasSeleccion} piezas de tu bodega por el envío ${envio.inbound_id}?`)) return;
                  setEnviando(true);
                  setError(null);
                  const r = await confirmarEnvioMl(
                    envio.inbound_id,
                    seleccion.map((l) => ({ clave: l.clave, sku: l.sku!, cantidad: Number(cantidades[l.clave]) || 0, nombre: l.nombreCrm ?? l.titulo, imagenUrl: l.imagen_url, piezasPorCaja: l.piezasPorCaja })),
                    bodegaId || null,
                  );
                  setEnviando(false);
                  if (r.error !== null) setError(r.error);
                  else {
                    setAbierto(false);
                    setMensaje(`Listo: salieron ${r.piezas} piezas de ${r.productos} producto(s).`);
                    router.refresh();
                  }
                }}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {enviando ? "Registrando…" : `Sí, descontar ${piezasSeleccion.toLocaleString("es-MX")} piezas`}
              </button>
              <button type="button" onClick={() => setAbierto(false)} className="text-xs text-zinc-500 hover:text-zinc-900">
                Cancelar
              </button>
            </div>
          </div>
        )}
        {envio.confirmado_en && (
          <div className="mt-2 flex items-center gap-3 text-xs">
            <Link href="/stock/movimientos" className="text-zinc-500 underline-offset-2 hover:underline">
              ver las salidas
            </Link>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm("¿Deshacer la confirmación? Se borran las salidas de bodega de este envío y vuelve a quedar por confirmar.")) return;
                const r = await deshacerConfirmacionMl(envio.inbound_id);
                if (r.error) setError(r.error);
                router.refresh();
              }}
              className="text-zinc-400 hover:text-red-600"
            >
              deshacer
            </button>
          </div>
        )}
        {mensaje && <p className="mt-2 text-xs text-emerald-700">{mensaje}</p>}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-zinc-400">datos crudos de Mercado Libre</summary>
          <pre className="mt-1 max-h-48 overflow-auto rounded bg-zinc-100 p-2 text-[10px] text-zinc-600">{JSON.stringify({ envio: envio.crudo, estado_ml: envio.estado_ml, origen: envio.origen }, null, 1)}</pre>
        </details>
      </div>
    </details>
  );
}

"use client";

import { useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Barra } from "../[id]/ocupacion-contenedor";
import { Selector } from "@/components/selector";
import { BotonGuardar } from "@/components/boton-guardar";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import {
  abonosExcedenMercancia,
  avisoExceso,
  espacioYPeso,
  ocupacionSiMueve,
  piezasAMover,
  prioridadDe,
  type ColumnaPlaneador,
} from "@/lib/planeador";
import { PRIORIDADES_PRODUCTO, type PrioridadProducto, type Producto, type TrasladoProducto } from "@/lib/tipos";
import { cambiarPrioridadProducto, crearContenedorSiguiente, moverProductoAContenedor } from "./actions";

const COLOR_PRIORIDAD: Record<PrioridadProducto, string> = {
  URGENTE: "bg-red-500",
  NORMAL: "bg-zinc-300",
  PUEDE_ESPERAR: "bg-sky-400",
};
const ETIQUETA_PRIORIDAD: Record<PrioridadProducto, string> = {
  URGENTE: "Urgente",
  NORMAL: "Normal",
  PUEDE_ESPERAR: "Puede esperar",
};

type Mensaje = { texto: string; tipo: "ok" | "error" } | null;

interface Dialogo {
  productoId: string;
  origenId: string;
  destinoId: string;
}

/** Columnas de contenedores en configuración con sus productos. Arrastrar
 * una tarjeta a otra columna (compu) o "Mover a…" (celular) abre la
 * pregunta "¿cuántas piezas?"; las barras se recalculan al guardar. */
export function Planeador({ columnas, traslados, verDinero }: { columnas: ColumnaPlaneador[]; traslados: TrasladoProducto[]; verDinero: boolean }) {
  const router = useRouter();
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [creando, empezarCrear] = useTransition();

  const todosProductos = columnas.flatMap((c) => c.productos);
  const totalPiezas = todosProductos.reduce((s, p) => s + p.cantidad, 0);
  const totalCbm = columnas.reduce((s, c) => s + c.ocupacion.cbm, 0);

  function abrirDialogo(productoId: string, destinoId?: string) {
    const producto = todosProductos.find((p) => p.id === productoId);
    if (!producto) return;
    const destino = destinoId ?? columnas.find((c) => c.contenedor.id !== producto.contenedor_id)?.contenedor.id;
    if (!destino) {
      setMensaje({ texto: "Para mover productos necesitas otro contenedor configurándose: dale a “+ Nuevo contenedor”.", tipo: "error" });
      return;
    }
    if (destino === producto.contenedor_id) return;
    setMensaje(null);
    setDialogo({ productoId, origenId: producto.contenedor_id, destinoId: destino });
  }

  function soltarEn(destinoId: string, e: DragEvent) {
    e.preventDefault();
    const productoId = e.dataTransfer.getData("text/plain") || arrastrando;
    setSobre(null);
    setArrastrando(null);
    if (productoId) abrirDialogo(productoId, destinoId);
  }

  function crearSiguiente() {
    const desde = columnas[columnas.length - 1];
    if (!desde) return;
    empezarCrear(async () => {
      const r = await crearContenedorSiguiente(desde.contenedor.id);
      if (r.error) setMensaje({ texto: r.error, tipo: "error" });
      else {
        setMensaje({
          texto: `Se creó el contenedor #${r.numero} copiando del #${desde.contenedor.numero} el proveedor, la capacidad y los gastos estimados. Ya puedes pasarle productos.`,
          tipo: "ok",
        });
        router.refresh();
      }
    });
  }

  const productoDialogo = dialogo ? todosProductos.find((p) => p.id === dialogo.productoId) ?? null : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600">
          {columnas.length === 0
            ? "Ningún contenedor se está configurando."
            : `${columnas.length} ${columnas.length === 1 ? "contenedor configurándose" : "contenedores configurándose"} · ${totalPiezas.toLocaleString("es-MX")} piezas · ${totalCbm.toFixed(1)} m³ en total`}
        </p>
        {columnas.length > 0 && (
          <button
            type="button"
            onClick={crearSiguiente}
            disabled={creando}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 active:scale-[0.97] disabled:opacity-50"
          >
            {creando ? "Creando…" : "+ Nuevo contenedor"}
          </button>
        )}
      </div>

      {mensaje && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm ${mensaje.tipo === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}
          role={mensaje.tipo === "error" ? "alert" : undefined}
        >
          {mensaje.texto}
        </div>
      )}

      {columnas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center">
          <p className="text-sm text-zinc-600">El planeador trabaja con los contenedores que todavía están en “Configurándose”.</p>
          <Link href="/contenedores/nuevo" className="mt-4 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
            + Nuevo contenedor
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:flex md:items-start md:overflow-x-auto md:pb-4">
          {columnas.map((col) => (
            <Columna
              key={col.contenedor.id}
              col={col}
              verDinero={verDinero}
              arrastrando={arrastrando}
              resaltada={sobre === col.contenedor.id && arrastrando !== null && !col.productos.some((p) => p.id === arrastrando)}
              alEntrar={() => setSobre(col.contenedor.id)}
              alSalir={() => setSobre((s) => (s === col.contenedor.id ? null : s))}
              alSoltar={(e) => soltarEn(col.contenedor.id, e)}
              empezarArrastre={setArrastrando}
              abrirDialogo={abrirDialogo}
              avisar={(texto) => setMensaje({ texto, tipo: "error" })}
            />
          ))}
        </div>
      )}

      <p className="mt-3 text-[11px] text-zinc-400">
        En compu: arrastra una tarjeta a otra columna. En celular: “Mover a…”. Solo participan contenedores en “Configurándose”; un contenedor que ya salió de China no se
        reacomoda. El punto de color es la urgencia (rojo = urgente, azul = puede esperar) y ordena cada columna.
      </p>

      {traslados.length > 0 && (
        <details className="mt-6 rounded-xl border border-zinc-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-700">Últimos traslados ({traslados.length})</summary>
          <ul className="divide-y divide-zinc-100 px-4 pb-3 text-xs text-zinc-600">
            {traslados.map((t) => (
              <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>
                  <span className="text-zinc-400">{formatoFecha(t.creado_en)}</span> · <span className="font-medium text-zinc-800">{t.nombre}</span>{" "}
                  <span className="font-mono text-[11px] text-zinc-400">{t.sku}</span>
                </span>
                <span className="tabular-nums">
                  {t.cantidad.toLocaleString("es-MX")} pzas · #{t.origen_numero ?? "?"} → #{t.destino_numero ?? "?"}
                  {t.parcial && <span className="ml-1 text-zinc-400">(una parte)</span>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {dialogo && productoDialogo && (
        <DialogoMover
          producto={productoDialogo}
          columnas={columnas}
          origenId={dialogo.origenId}
          destinoInicial={dialogo.destinoId}
          verDinero={verDinero}
          cerrar={() => setDialogo(null)}
          listo={(texto) => {
            setDialogo(null);
            setMensaje({ texto, tipo: "ok" });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Columna({
  col,
  verDinero,
  arrastrando,
  resaltada,
  alEntrar,
  alSalir,
  alSoltar,
  empezarArrastre,
  abrirDialogo,
  avisar,
}: {
  col: ColumnaPlaneador;
  verDinero: boolean;
  arrastrando: string | null;
  resaltada: boolean;
  alEntrar: () => void;
  alSalir: () => void;
  alSoltar: (e: DragEvent) => void;
  empezarArrastre: (id: string | null) => void;
  abrirDialogo: (productoId: string, destinoId?: string) => void;
  avisar: (texto: string) => void;
}) {
  const o = col.ocupacion;
  const exceso = avisoExceso(o);
  const piezas = col.productos.reduce((s, p) => s + p.cantidad, 0);
  const proveedor = [col.contenedor.fabrica_principal, col.contenedor.proveedor_principal].filter(Boolean).join(" · ");
  const borde = exceso ? "border-red-200" : o.nivel === "atencion" ? "border-amber-200" : "border-zinc-200";

  return (
    <section
      className={`flex w-full flex-col rounded-2xl border bg-white shadow-sm transition md:w-80 md:shrink-0 ${borde} ${resaltada ? "ring-2 ring-zinc-900 ring-offset-2" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        alEntrar();
      }}
      onDragLeave={alSalir}
      onDrop={alSoltar}
    >
      <header className="border-b border-zinc-100 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <Link href={`/contenedores/${col.contenedor.id}`} className="text-lg font-semibold tracking-tight text-zinc-900 hover:underline">
            Contenedor #{col.contenedor.numero}
          </Link>
          <span className="text-[11px] tabular-nums text-zinc-500">
            {col.productos.length} {col.productos.length === 1 ? "producto" : "productos"} · {piezas.toLocaleString("es-MX")} pzas
          </span>
        </div>
        {proveedor && <p className="mt-0.5 truncate text-xs text-zinc-500">{proveedor}</p>}
        <div className="mt-3 space-y-3">
          <Barra etiqueta="Espacio" usado={o.cbm.toFixed(1)} limite={String(o.capacidadCbm)} pct={o.pctCbm} unidad="m³" />
          <Barra etiqueta="Peso" usado={Math.round(o.pesoKg).toLocaleString("es-MX")} limite={o.limitePesoKg.toLocaleString("es-MX")} pct={o.pctPeso} unidad="kg" />
        </div>
        {exceso ? <p className="mt-2 text-xs font-medium text-red-700">{exceso}</p> : <p className="mt-2 text-[11px] leading-snug text-zinc-500">{o.aviso}</p>}
        {verDinero && (
          <p className="mt-2 text-xs text-zinc-600">
            Costo estimado: <span className="font-semibold text-zinc-900">{formatoPesos(col.costoPorCbm)}</span> por m³
            {col.costoEstimado && <span className="text-amber-700"> (est.)</span>}
          </p>
        )}
        {verDinero && abonosExcedenMercancia(col.totalUsd, col.abonadoUsd) && (
          <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
            Abonos de más: hay ${col.abonadoUsd.toLocaleString("es-MX")} USD abonados y la mercancía que queda vale ${col.totalUsd.toLocaleString("es-MX")} USD. Revisa los
            abonos en el contenedor.
          </p>
        )}
      </header>

      <ul className="flex-1 space-y-2 p-3">
        {col.productos.map((p) => (
          <TarjetaProducto
            key={p.id}
            producto={p}
            arrastrando={arrastrando === p.id}
            empezarArrastre={empezarArrastre}
            abrirDialogo={abrirDialogo}
            avisar={avisar}
          />
        ))}
        {col.productos.length === 0 && (
          <li className="rounded-xl border border-dashed border-zinc-300 px-3 py-6 text-center text-xs text-zinc-400">Suelta productos aquí o usa “Mover a…” en otra columna.</li>
        )}
        {resaltada && col.productos.length > 0 && <li className="rounded-xl border-2 border-dashed border-zinc-900/40 px-3 py-3 text-center text-xs text-zinc-500">Suelta aquí</li>}
      </ul>
    </section>
  );
}

function TarjetaProducto({
  producto,
  arrastrando,
  empezarArrastre,
  abrirDialogo,
  avisar,
}: {
  producto: Producto;
  arrastrando: boolean;
  empezarArrastre: (id: string | null) => void;
  abrirDialogo: (productoId: string) => void;
  avisar: (texto: string) => void;
}) {
  const { cbm, kg } = espacioYPeso(producto);
  const prioridad = prioridadDe(producto);
  const sinPeso = !(Number(producto.peso_kg) > 0);

  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", producto.id);
        e.dataTransfer.effectAllowed = "move";
        empezarArrastre(producto.id);
      }}
      onDragEnd={() => empezarArrastre(null)}
      className={`cursor-grab rounded-xl border border-zinc-200 bg-white p-3 shadow-sm transition active:cursor-grabbing ${arrastrando ? "opacity-40" : "hover:border-zinc-300"}`}
    >
      <div className="flex gap-3">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${COLOR_PRIORIDAD[prioridad]}`} title={ETIQUETA_PRIORIDAD[prioridad]} />
        {producto.imagen_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={producto.imagen_url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" draggable={false} />
        ) : (
          <div className="h-12 w-12 shrink-0 rounded-lg bg-zinc-100" />
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-zinc-900">{producto.nombre}</p>
          <p className="font-mono text-[11px] text-zinc-500">{producto.sku}</p>
          <p className="mt-1 text-xs tabular-nums text-zinc-600">
            <span className="font-semibold text-zinc-900">{producto.cantidad.toLocaleString("es-MX")}</span> pzas · {cbm.toFixed(2)} m³ ·{" "}
            {sinPeso ? <span className="text-amber-700">sin peso</span> : `${Math.round(kg).toLocaleString("es-MX")} kg`}
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <BotonPrioridad producto={producto} prioridad={prioridad} avisar={avisar} />
        <button type="button" onClick={() => abrirDialogo(producto.id)} className="text-xs font-medium text-zinc-700 hover:text-zinc-900">
          Mover a… →
        </button>
      </div>
    </li>
  );
}

function BotonPrioridad({ producto, prioridad, avisar }: { producto: Producto; prioridad: PrioridadProducto; avisar: (texto: string) => void }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [guardando, empezar] = useTransition();

  function elegir(valor: PrioridadProducto) {
    setAbierto(false);
    if (valor === prioridad) return;
    empezar(async () => {
      const r = await cambiarPrioridadProducto(producto.id, valor);
      if (r.error) avisar(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        disabled={guardando}
        className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-600 hover:border-zinc-400 disabled:opacity-50"
        title="Cambiar urgencia"
      >
        <span className={`h-2 w-2 rounded-full ${COLOR_PRIORIDAD[prioridad]}`} />
        {guardando ? "Guardando…" : ETIQUETA_PRIORIDAD[prioridad]}
      </button>
      {abierto && (
        <div className="absolute left-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
          {PRIORIDADES_PRODUCTO.map((p) => (
            <button
              key={p.valor}
              type="button"
              onClick={() => elegir(p.valor)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-zinc-50 ${p.valor === prioridad ? "font-semibold text-zinc-900" : "text-zinc-700"}`}
            >
              <span className={`h-2 w-2 rounded-full ${COLOR_PRIORIDAD[p.valor]}`} />
              {p.etiqueta}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function colorPct(pct: number) {
  return pct > 100 ? "text-red-700" : pct >= 90 ? "text-amber-700" : "text-emerald-700";
}

function DialogoMover({
  producto,
  columnas,
  origenId,
  destinoInicial,
  verDinero,
  cerrar,
  listo,
}: {
  producto: Producto;
  columnas: ColumnaPlaneador[];
  origenId: string;
  destinoInicial: string;
  verDinero: boolean;
  cerrar: () => void;
  listo: (texto: string) => void;
}) {
  const [destinoId, setDestinoId] = useState(destinoInicial);
  const [modo, setModo] = useState<"todas" | "parte">("todas");
  const [parte, setParte] = useState(String(Math.max(1, Math.floor(producto.cantidad / 2))));
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();

  const origen = columnas.find((c) => c.contenedor.id === origenId);
  const destino = columnas.find((c) => c.contenedor.id === destinoId);
  const destinos = columnas.filter((c) => c.contenedor.id !== origenId);
  const cantidad = piezasAMover(producto, modo === "todas" ? producto.cantidad : Number(parte));
  const { cbm, kg } = espacioYPeso(producto, cantidad);
  const oDestino = destino ? ocupacionSiMueve(destino.contenedor, destino.productos, producto, cantidad, "entra") : null;
  const oOrigen = origen ? ocupacionSiMueve(origen.contenedor, origen.productos, producto, cantidad, "sale") : null;

  function mover() {
    if (!destino) return;
    if (cantidad <= 0) {
      setError("Pon cuántas piezas quieres mover (al menos 1).");
      return;
    }
    setError(null);
    empezar(async () => {
      const r = await moverProductoAContenedor(producto.id, destino.contenedor.id, cantidad);
      if (r.error) setError(r.error);
      else
        listo(
          r.parcial
            ? `Se pasaron ${cantidad.toLocaleString("es-MX")} de ${producto.cantidad.toLocaleString("es-MX")} piezas de “${producto.nombre}” al contenedor #${destino.contenedor.numero}; el resto se quedó en el #${origen?.contenedor.numero}.`
            : `“${producto.nombre}” (${cantidad.toLocaleString("es-MX")} pzas) pasó al contenedor #${destino.contenedor.numero}.`,
        );
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-zinc-900/30 p-4 sm:items-center" onClick={cerrar}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-3">
          {producto.imagen_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={producto.imagen_url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="h-14 w-14 shrink-0 rounded-lg bg-zinc-100" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900">Mover “{producto.nombre}”</p>
            <p className="font-mono text-[11px] text-zinc-500">{producto.sku}</p>
            <p className="text-xs text-zinc-600">
              Está en el contenedor <span className="font-semibold">#{origen?.contenedor.numero}</span> con {producto.cantidad.toLocaleString("es-MX")} piezas.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-xs font-medium text-zinc-500">Pasar al contenedor</label>
          <div className="mt-1">
            <Selector
              key={destinoInicial}
              defaultValue={destinoInicial}
              onChange={setDestinoId}
              opciones={destinos.map((c) => ({
                value: c.contenedor.id,
                label: `#${c.contenedor.numero} · ${Math.round(c.ocupacion.pctCbm)} % espacio · ${Math.round(c.ocupacion.pctPeso)} % peso`,
              }))}
            />
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs font-medium text-zinc-500">¿Cuántas piezas?</p>
          <div className="mt-1 flex overflow-hidden rounded-lg border border-zinc-300 text-xs">
            <button
              type="button"
              onClick={() => setModo("todas")}
              className={`flex-1 px-3 py-1.5 ${modo === "todas" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:text-zinc-900"}`}
            >
              Todas ({producto.cantidad.toLocaleString("es-MX")})
            </button>
            <button
              type="button"
              onClick={() => setModo("parte")}
              className={`flex-1 px-3 py-1.5 ${modo === "parte" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:text-zinc-900"}`}
            >
              Solo una parte
            </button>
          </div>
          {modo === "parte" && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={producto.cantidad}
                step={1}
                inputMode="numeric"
                value={parte}
                onChange={(e) => setParte(e.target.value)}
                className="w-28 rounded-lg border border-zinc-300 px-3 py-2 text-sm tabular-nums focus:border-zinc-500 focus:ring-zinc-500"
              />
              <span className="text-xs text-zinc-500">
                piezas se van · {Math.max(0, producto.cantidad - cantidad).toLocaleString("es-MX")} se quedan en el #{origen?.contenedor.numero}
              </span>
            </div>
          )}
          <p className="mt-2 text-[11px] text-zinc-500">
            Se mueven {cbm.toFixed(2)} m³ y {Math.round(kg).toLocaleString("es-MX")} kg{!(Number(producto.peso_kg) > 0) ? " (sin peso capturado)" : ""}.
          </p>
        </div>

        {oDestino && oOrigen && destino && origen && (
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-zinc-50 p-3 text-xs">
            <div>
              <p className="text-zinc-500">El #{destino.contenedor.numero} quedaría en</p>
              <p className={`mt-0.5 font-semibold tabular-nums ${colorPct(Math.max(oDestino.pctCbm, oDestino.pctPeso))}`}>
                {Math.round(oDestino.pctCbm)} % espacio · {Math.round(oDestino.pctPeso)} % peso
              </p>
              {avisoExceso(oDestino) && <p className="mt-0.5 text-[11px] text-red-700">Se pasa: {oDestino.cbm.toFixed(1)} de {oDestino.capacidadCbm} m³.</p>}
            </div>
            <div>
              <p className="text-zinc-500">El #{origen.contenedor.numero} quedaría en</p>
              <p className={`mt-0.5 font-semibold tabular-nums ${colorPct(Math.max(oOrigen.pctCbm, oOrigen.pctPeso))}`}>
                {Math.round(oOrigen.pctCbm)} % espacio · {Math.round(oOrigen.pctPeso)} % peso
              </p>
            </div>
          </div>
        )}

        {verDinero && origen && origen.abonadoUsd > 0 && (
          <p className="mt-3 text-[11px] text-zinc-500">Los abonos de mercancía se quedan en el #{origen.contenedor.numero}; si alguno era de esta mercancía, muévelo a mano.</p>
        )}

        {error && (
          <p className="mt-3 text-xs text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button type="button" onClick={cerrar} className="text-sm text-zinc-500 hover:text-zinc-900">
            Cancelar
          </button>
          <BotonGuardar
            onClick={mover}
            cargando={guardando}
            textoCargando="Moviendo…"
            mostrarListo={false}
            disabled={!destino || cantidad <= 0}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Mover {cantidad.toLocaleString("es-MX")} {cantidad === 1 ? "pieza" : "piezas"} →
          </BotonGuardar>
        </div>
      </div>
    </div>
  );
}

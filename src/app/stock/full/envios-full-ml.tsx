"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fechaTextoMx, formatoFechaHoraMx, formatoFechaMx } from "@/lib/fechas-mx";
import { DIAS_EN_CAMINO_AVISO, ETIQUETA_ESTADO_ENVIO_ML, diasEnCamino, diferenciaLinea, faseDe, type DecisionDiferencia, type EnvioFullMl, type FaseEnvio, type LineaAgrupada, type MomentoEnvio } from "@/lib/mercadolibre-envios-full";
import type { RecepcionFull } from "@/lib/tipos";
import { Selector } from "@/components/selector";
import { CampoFecha } from "@/components/campo-fecha";
import { capturarEnvioMl, cerrarEnvioMl, deshacerEnvioMl, ignorarEnvioMl, ignorarRecepcionMl, llegadaCompletaMl, llegadaDesdePanelMl, registrarSalidaEnvioMl } from "./actions";

export interface LineaParaPantalla extends LineaAgrupada {
  /** Producto del CRM resuelto por la liga (null = sin ligar). */
  sku: string | null;
  nombreCrm: string | null;
  stockBodega: number | null;
  /** Piezas del CRM por unidad de ML (2 = un par de mancuernas). */
  factor: number;
  /** Piezas (CRM) que ML ya subió en Full de este producto desde que salió el envío. */
  subioEnFull: number;
}

export interface EnvioParaPantalla {
  envio: EnvioFullMl;
  lineas: LineaParaPantalla[];
}

export interface BodegaOpcion {
  id: string;
  nombre: string;
}

const btnSec = "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50";
const btnPri = "rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50";
const PLACEHOLDER_PANEL = "Código ML: IBHA96856 +2\n2 Piezas - Bloques De Yoga Cómodos Y Fuertes Daymart Color Azul Claro\n5,619.74 cm3\n150 u.\n149 u.\n1 u.\n(de menos)\n149 u.\n…";

const ETIQUETA_FASE: Record<FaseEnvio, { texto: string; clase: string }> = {
  EN_CAMINO: { texto: "En camino a Full", clase: "bg-[#2D3277]/5 text-[#2D3277] ring-[#2D3277]/20" },
  POR_CERRAR: { texto: "Llegó · diferencias por resolver", clase: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  PENDIENTE_REGISTRAR: { texto: "Capturado · falta descontar", clase: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  CERRADO: { texto: "Cerrado", clase: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  IGNORADO: { texto: "No salió de bodega", clase: "bg-zinc-100 text-zinc-500 ring-zinc-300" },
  CANCELADO: { texto: "Cancelado", clase: "bg-red-50 text-red-700 ring-red-600/20" },
};

function TextareaPanel({ value, onChange, rows = 6 }: { value: string; onChange: (v: string) => void; rows?: number }) {
  return <textarea value={value} onChange={(e) => onChange(e.target.value)} required rows={rows} placeholder={PLACEHOLDER_PANEL} className="mt-2 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs" />;
}

/** Registrar un envío a Full pegando la tabla del panel de ML. Dos momentos:
 * "acaba de salir" (la bodega se descuenta con las declaradas) o "ya llegó"
 * (se descuenta y de una vez se concilia con las Aptas para Full). */
export function CapturarEnvioMl({ bodegas }: { bodegas: BodegaOpcion[] }) {
  const router = useRouter();
  const hoy = fechaTextoMx(new Date());
  const [numero, setNumero] = useState("");
  const [momento, setMomento] = useState<MomentoEnvio>("EN_CAMINO");
  const [fecha, setFecha] = useState(hoy);
  const [bodegaId, setBodegaId] = useState(bodegas[0]?.id ?? "");
  const [textoPanel, setTextoPanel] = useState("");
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      id="capturar"
      onSubmit={async (e) => {
        e.preventDefault();
        setCargando(true);
        setError(null);
        setMensaje(null);
        const r = await capturarEnvioMl(numero, textoPanel, momento, fecha || null, bodegaId || null);
        setCargando(false);
        if (r.error) setError(r.error);
        else {
          const n = numero.trim();
          const partes = [
            momento === "EN_CAMINO"
              ? `Listo: el envío ${n} quedó en camino con ${r.productos} producto(s) y ${r.piezas.toLocaleString("es-MX")} piezas declaradas, ya descontadas de tu bodega. Cuando ML lo reciba, dale "ML lo recibió completo" o pega la tabla si hubo diferencias.`
              : r.cerrado
                ? `Listo: el envío ${n} se descontó de tu bodega (${r.productos} producto(s), ${r.piezas.toLocaleString("es-MX")} piezas) y ML lo recibió completo: quedó cerrado.`
                : `Listo: el envío ${n} se descontó de tu bodega (${r.productos} producto(s), ${r.piezas.toLocaleString("es-MX")} piezas). ML recibió ${r.diferencias} producto(s) con diferencia: abajo decide si se quedaron en bodega o fueron merma y ciérralo.`,
            r.sinLigar ? `Ojo: ${r.sinLigar} producto(s) no están ligados a un producto del CRM, así que sus piezas todavía NO se descontaron; lígalos en Ligar SKUs y se descuentan solos.` : "",
            r.sinPublicacion.length ? `${r.sinPublicacion.length} código(s) no están en tus publicaciones sincronizadas (${r.sinPublicacion.join(", ")}): dale "Actualizar" en Publicaciones y vuelve a pegar.` : "",
          ].filter(Boolean);
          setMensaje(partes.join(" "));
          setNumero("");
          setTextoPanel("");
        }
        router.refresh();
      }}
      className="rounded-2xl border border-emerald-300 bg-emerald-50/60 p-4 sm:p-5"
    >
      <p className="text-sm font-semibold text-zinc-900">Registrar un envío a Full</p>
      <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-zinc-600">
        <li>En Mercado Libre abre el envío (Gestión de envíos Full → el número).</li>
        <li>Selecciona con el mouse toda la tabla de productos (desde el primer “Código ML:” hasta la fila “Total”) y cópiala (Ctrl+C / Cmd+C).</li>
        <li>Pégala aquí, pon el número y di en qué va el envío.</li>
      </ol>
      <div className="mt-3 flex flex-wrap gap-2">
        {(
          [
            ["EN_CAMINO", "Acaba de salir de mi bodega (va en camino)"],
            ["LLEGO", "Ya llegó a Full"],
          ] as [MomentoEnvio, string][]
        ).map(([valor, etiqueta]) => (
          <button
            key={valor}
            type="button"
            onClick={() => setMomento(valor)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset ${momento === valor ? "bg-zinc-900 text-white ring-zinc-900" : "bg-white text-zinc-600 ring-zinc-300 hover:bg-zinc-50"}`}
          >
            {etiqueta}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">
        {momento === "EN_CAMINO"
          ? "Se descuentan de tu bodega las piezas declaradas, con la fecha en que salió. Cuando ML lo reciba, lo cierras con un clic (o pegas la tabla si hubo diferencias)."
          : "Se descuentan las declaradas y se toma la columna “Aptas para Full” como lo recibido; si hay diferencias, decides producto por producto."}
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[11px] font-medium text-zinc-500">Número de envío</label>
          <input type="text" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="77396369" required className="mt-1 w-44 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-zinc-500">Fecha en que salió de tu bodega</label>
          <div className="mt-1 w-44">
            <CampoFecha name="fecha_salida" defaultValue={hoy} max={hoy} onChange={setFecha} />
          </div>
        </div>
        {bodegas.length > 1 && (
          <div className="w-48">
            <label className="block text-[11px] font-medium text-zinc-500">Bodega</label>
            <div className="mt-1">
              <Selector defaultValue={bodegaId} onChange={setBodegaId} opciones={bodegas.map((b) => ({ value: b.id, label: b.nombre }))} />
            </div>
          </div>
        )}
      </div>
      <TextareaPanel value={textoPanel} onChange={setTextoPanel} />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={cargando || !numero.trim() || !textoPanel.trim()} className={btnPri}>
          {cargando ? "Registrando…" : momento === "EN_CAMINO" ? "Registrar envío (sale de bodega)" : "Registrar envío (ya llegó)"}
        </button>
        <span className="text-[11px] text-zinc-500">Un par de mancuernas sale como 2 piezas si así está ligado. Nada se descuenta dos veces: si el número ya existe, te aviso.</span>
      </div>
      {mensaje && <p className="mt-2 text-xs text-emerald-700">{mensaje}</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </form>
  );
}

/** Subidas de stock en Full que ningún envío capturado explica. */
export function AvisoSinExplicar({ recepciones }: { recepciones: RecepcionFull[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  if (!recepciones.length) return null;
  return (
    <div id="sin-explicar" className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-medium text-amber-900">Subió el stock en Full de {recepciones.length} producto(s) y no hay ningún envío capturado que lo explique</p>
      <p className="text-xs text-amber-800">Si fue un envío tuyo, captúralo arriba con su número (y esto se explica solo). Si no salió de tu bodega (ej. una devolución que llegó a Full), márcalo.</p>
      <ul className="mt-2 divide-y divide-amber-200/60">
        {recepciones.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs">
            <span className="text-amber-900">
              {formatoFechaMx(r.detectado_en)} · {r.titulo ?? r.inventory_id} · <strong>+{Number(r.cantidad).toLocaleString("es-MX")} pzas</strong>
              {r.sku_crm && <span className="font-mono text-amber-700"> · {r.sku_crm}</span>}
            </span>
            <button
              type="button"
              onClick={async () => {
                const x = await ignorarRecepcionMl(r.id);
                if (x.error) setError(x.error);
                router.refresh();
              }}
              className="text-amber-700 underline-offset-2 hover:underline"
            >
              no fue de mi bodega
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function LineaEnvio({ l, fase }: { l: LineaParaPantalla; fase: FaseEnvio }) {
  const diff = fase === "POR_CERRAR" || fase === "CERRADO" ? diferenciaLinea({ cantidad_planeada: l.planeadas, cantidad_recibida: l.recibidas }) : 0;
  const declaradas = l.planeadas ?? l.recibidas;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
      <div className="flex items-center gap-3">
        {l.imagen_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- miniatura de ML
          <img src={l.imagen_url} alt="" className="h-9 w-9 rounded-lg object-cover" />
        ) : (
          <div className="h-9 w-9 rounded-lg bg-zinc-100" />
        )}
        <div>
          <p className="text-zinc-900">{l.titulo ?? l.item_id ?? l.inventory_id ?? "Producto"}</p>
          <p className="text-xs text-zinc-400">
            {l.inventory_id && <span className="font-mono">{l.inventory_id}</span>}
            {l.seller_sku && <> · SKU ML {l.seller_sku}</>}
            {" · "}
            {l.sku ? (
              <span className="text-zinc-600">
                CRM: <span className="font-mono">{l.sku}</span>
                {l.stockBodega !== null && <> · {l.stockBodega.toLocaleString("es-MX")} en bodega</>}
                {!l.salidaGenerada && fase !== "PENDIENTE_REGISTRAR" && <span className="text-amber-700"> · su salida se genera en la siguiente revisión</span>}
              </span>
            ) : (
              <Link href="/mercadolibre/skus" className="text-amber-700 underline-offset-2 hover:underline">
                sin ligar con un producto del CRM → ligar (sus piezas se descuentan solas al ligarlo)
              </Link>
            )}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {fase === "EN_CAMINO" && (
          <span className="text-zinc-500">
            salieron <strong className="text-zinc-900">{declaradas.toLocaleString("es-MX")}</strong>
            {l.factor > 1 && <span className="text-violet-700"> × {l.factor} = {(declaradas * l.factor).toLocaleString("es-MX")} pzas</span>}
          </span>
        )}
        {fase === "EN_CAMINO" && l.subioEnFull > 0 && <span className="rounded-full bg-[#2D3277]/5 px-2 py-0.5 text-[#2D3277]">ML ya subió {l.subioEnFull.toLocaleString("es-MX")} pzas</span>}
        {(fase === "POR_CERRAR" || fase === "CERRADO" || fase === "PENDIENTE_REGISTRAR") && (
          <span className="text-zinc-500">
            declaradas <strong className="text-zinc-900">{declaradas.toLocaleString("es-MX")}</strong> · recibidas <strong className="text-emerald-700">{l.recibidas.toLocaleString("es-MX")}</strong>
            {l.factor > 1 && <span className="text-violet-700"> (× {l.factor} pzas)</span>}
          </span>
        )}
        {diff > 0 && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
            faltaron {diff.toLocaleString("es-MX")}
            {fase === "CERRADO" && l.decision && <> · {l.decision === "MERMA" ? "merma" : "se quedaron en bodega"}</>}
          </span>
        )}
        {diff < 0 && <span className="rounded-full bg-[#2D3277]/5 px-2 py-0.5 font-medium text-[#2D3277]">{Math.abs(diff).toLocaleString("es-MX")} de más</span>}
      </div>
    </li>
  );
}

/** Un envío a Full: según su fase, los botones para cerrarlo, resolver
 * diferencias, registrar la salida (flujo viejo) o deshacerlo. */
export function TarjetaEnvioMl({ datos, bodegas }: { datos: EnvioParaPantalla; bodegas: BodegaOpcion[] }) {
  const router = useRouter();
  const { envio, lineas } = datos;
  const fase = faseDe(envio);
  const hoy = fechaTextoMx(new Date());
  const [pegando, setPegando] = useState(false);
  const [textoPanel, setTextoPanel] = useState("");
  const [decisiones, setDecisiones] = useState<Record<string, DecisionDiferencia>>({});
  const [fechaSalida, setFechaSalida] = useState(envio.fecha_recepcion ? fechaTextoMx(new Date(envio.fecha_recepcion)) : hoy);
  const [bodegaId, setBodegaId] = useState(bodegas[0]?.id ?? "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const dias = diasEnCamino(envio);
  const totalDeclaradas = lineas.reduce((s, l) => s + (l.planeadas ?? l.recibidas), 0);
  const totalRecibidas = lineas.reduce((s, l) => s + l.recibidas, 0);
  const sinLigar = lineas.filter((l) => !l.sku).length;
  const conDiferencia = lineas.filter((l) => diferenciaLinea({ cantidad_planeada: l.planeadas, cantidad_recibida: l.recibidas }) !== 0);
  const faltantes = conDiferencia.filter((l) => diferenciaLinea({ cantidad_planeada: l.planeadas, cantidad_recibida: l.recibidas }) > 0);
  const abierto = fase === "EN_CAMINO" || fase === "POR_CERRAR" || fase === "PENDIENTE_REGISTRAR";
  const etiqueta = ETIQUETA_FASE[fase];

  async function correr(accion: () => Promise<{ error: string | null }>, exito?: string) {
    setEnviando(true);
    setError(null);
    setMensaje(null);
    const r = await accion();
    setEnviando(false);
    if (r.error) setError(r.error);
    else if (exito) setMensaje(exito);
    router.refresh();
  }

  return (
    <details open={abierto} className={`group rounded-2xl border bg-white shadow-sm ${fase === "POR_CERRAR" || fase === "PENDIENTE_REGISTRAR" ? "border-amber-300 ring-2 ring-amber-100" : fase === "EN_CAMINO" ? "border-[#2D3277]/30" : "border-zinc-200"}`}>
      <summary className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="inline-block transition-transform group-open:rotate-90">▸</span>
          <div>
            <p className="text-sm font-medium text-zinc-900">
              Envío a Full <span className="font-mono">{envio.inbound_id}</span>
            </p>
            <p className="text-xs text-zinc-400">
              {lineas.length} producto(s) · {totalDeclaradas.toLocaleString("es-MX")} piezas declaradas
              {(fase === "POR_CERRAR" || fase === "CERRADO") && <> · <span className="text-emerald-700">{totalRecibidas.toLocaleString("es-MX")} recibidas por ML</span></>}
              {envio.salio_en && <> · salió {formatoFechaMx(envio.salio_en)}</>}
              {fase === "EN_CAMINO" && (
                <>
                  {" · "}
                  <span className={dias >= DIAS_EN_CAMINO_AVISO ? "font-medium text-amber-700" : ""}>
                    {dias} día{dias === 1 ? "" : "s"} en camino
                  </span>
                </>
              )}
              {envio.fecha_recepcion && fase !== "EN_CAMINO" && <> · llegó {formatoFechaMx(envio.fecha_recepcion)}</>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {envio.cerrado_en && <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-500">cerrado {formatoFechaHoraMx(envio.cerrado_en)}</span>}
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${etiqueta.clase}`} title={envio.estado_ml ?? ETIQUETA_ESTADO_ENVIO_ML[envio.estado]}>
            {etiqueta.texto}
          </span>
        </div>
      </summary>
      <div className="border-t border-zinc-100 px-5 py-3">
        {lineas.length === 0 && <p className="text-xs text-zinc-400">Este envío no tiene productos.</p>}
        <ul className="divide-y divide-zinc-50">
          {lineas.map((l) => (
            <LineaEnvio key={l.clave} l={l} fase={fase} />
          ))}
        </ul>
        {sinLigar > 0 && abierto && (
          <p className="mt-2 text-xs text-amber-700">
            {sinLigar} producto(s) sin ligar: sus piezas todavía no se descuentan de tu bodega. Lígalos en{" "}
            <Link href="/mercadolibre/skus" className="underline">
              Ligar SKUs
            </Link>{" "}
            y se descuentan solos.
          </p>
        )}

        {/* ---- En camino: ML lo recibió ---- */}
        {fase === "EN_CAMINO" && !pegando && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={enviando}
              onClick={() => {
                if (!window.confirm(`¿Mercado Libre recibió el envío ${envio.inbound_id} completo, con las ${totalDeclaradas.toLocaleString("es-MX")} piezas declaradas? Se cierra sin diferencias.`)) return;
                void correr(() => llegadaCompletaMl(envio.inbound_id), "Listo: el envío quedó cerrado, ML lo recibió completo.");
              }}
              className={btnPri}
            >
              ML lo recibió completo
            </button>
            <button type="button" disabled={enviando} onClick={() => setPegando(true)} className={btnSec}>
              Llegó con diferencias: pegar la tabla
            </button>
          </div>
        )}
        {(fase === "EN_CAMINO" || fase === "POR_CERRAR") && pegando && (
          <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs text-zinc-700">Abre el envío en Mercado Libre (ya recibido), copia la tabla de productos y pégala: se toma la columna “Aptas para Full” como lo recibido.</p>
            <TextareaPanel value={textoPanel} onChange={setTextoPanel} rows={5} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={enviando || !textoPanel.trim()}
                onClick={() =>
                  void correr(async () => {
                    const r = await llegadaDesdePanelMl(envio.inbound_id, textoPanel);
                    if (!r.error) {
                      setPegando(false);
                      setTextoPanel("");
                      setMensaje(r.cerrado ? "Listo: ML recibió todo tal como se declaró; el envío quedó cerrado." : `ML recibió ${r.diferencias} producto(s) con diferencia: decide abajo qué pasó con cada uno y cierra el envío.${r.sinPublicacion.length ? ` Ojo: ${r.sinPublicacion.join(", ")} no están en tus publicaciones sincronizadas.` : ""}`);
                    }
                    return r;
                  })
                }
                className={btnPri}
              >
                {enviando ? "Registrando…" : "Registrar llegada"}
              </button>
              <button type="button" onClick={() => setPegando(false)} className="text-xs text-zinc-500 hover:text-zinc-900">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* ---- Llegó con diferencias: decidir y cerrar ---- */}
        {fase === "POR_CERRAR" && !pegando && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
            <p className="text-sm font-medium text-zinc-900">¿Qué pasó con lo que no llegó?</p>
            <p className="text-xs text-zinc-600">Por cada producto que ML recibió de menos: si se quedó en tu bodega, esas piezas regresan a tu stock; si se perdió o llegó dañado, queda como merma (ya no están en tu bodega ni en Full).</p>
            <ul className="mt-2 space-y-2">
              {faltantes.map((l) => {
                const diff = diferenciaLinea({ cantidad_planeada: l.planeadas, cantidad_recibida: l.recibidas });
                const piezas = diff * (l.factor || 1);
                return (
                  <li key={l.clave} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-zinc-800">
                      {l.titulo ?? l.inventory_id} · faltaron <strong>{piezas.toLocaleString("es-MX")} pzas</strong>
                      {!l.sku && <span className="text-amber-700"> (sin ligar: se aplica cuando lo ligues)</span>}
                    </span>
                    <div className="w-64">
                      <Selector
                        defaultValue={decisiones[l.clave] ?? "QUEDO_EN_BODEGA"}
                        onChange={(v) => setDecisiones((d) => ({ ...d, [l.clave]: v as DecisionDiferencia }))}
                        opciones={[
                          { value: "QUEDO_EN_BODEGA", label: "Se quedaron en mi bodega (regresan al stock)" },
                          { value: "MERMA", label: "Se perdieron o llegaron dañadas (merma)" },
                        ]}
                      />
                    </div>
                  </li>
                );
              })}
              {conDiferencia
                .filter((l) => diferenciaLinea({ cantidad_planeada: l.planeadas, cantidad_recibida: l.recibidas }) < 0)
                .map((l) => (
                  <li key={l.clave} className="text-xs text-zinc-700">
                    {l.titulo ?? l.inventory_id}: ML recibió {Math.abs(diferenciaLinea({ cantidad_planeada: l.planeadas, cantidad_recibida: l.recibidas })).toLocaleString("es-MX")} de más de lo declarado; esas piezas también salen de tu bodega.
                  </li>
                ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={enviando}
                onClick={() => {
                  const decis = faltantes.flatMap((l) => l.lineaIds.map((lineaId) => ({ lineaId, decision: decisiones[l.clave] ?? ("QUEDO_EN_BODEGA" as DecisionDiferencia) })));
                  void correr(async () => {
                    const r = await cerrarEnvioMl(envio.inbound_id, decis);
                    if (!r.error) setMensaje(`Listo: envío cerrado.${r.regresaron ? ` ${r.regresaron.toLocaleString("es-MX")} pzas regresaron a tu bodega.` : ""}${r.mermas ? ` ${r.mermas.toLocaleString("es-MX")} pzas quedaron como merma.` : ""}`);
                    return r;
                  });
                }}
                className={btnPri}
              >
                {enviando ? "Cerrando…" : "Cerrar envío"}
              </button>
              <button type="button" disabled={enviando} onClick={() => setPegando(true)} className={btnSec}>
                Volver a pegar la tabla
              </button>
            </div>
          </div>
        )}

        {/* ---- Flujo viejo: capturado pero sin descontar ---- */}
        {fase === "PENDIENTE_REGISTRAR" && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
            <p className="text-xs text-zinc-700">Este envío se capturó antes del cambio y todavía no se ha descontado de tu bodega. Dime cuándo salió y lo registro con las piezas declaradas{envio.estado === "RECIBIDO" || envio.estado === "CONTADO" ? "; como ML ya lo recibió, queda cerrado de una vez" : ""}.</p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-500">Fecha en que salió</label>
                <div className="mt-1 w-44">
                  <CampoFecha name={`fecha_${envio.inbound_id}`} defaultValue={fechaSalida} max={hoy} onChange={setFechaSalida} />
                </div>
              </div>
              {bodegas.length > 1 && (
                <div className="w-48">
                  <label className="block text-[11px] font-medium text-zinc-500">Bodega</label>
                  <div className="mt-1">
                    <Selector defaultValue={bodegaId} onChange={setBodegaId} opciones={bodegas.map((b) => ({ value: b.id, label: b.nombre }))} />
                  </div>
                </div>
              )}
              <button
                type="button"
                disabled={enviando}
                onClick={() => {
                  if (!window.confirm(`¿Descontar de tu bodega las ${totalDeclaradas.toLocaleString("es-MX")} piezas declaradas del envío ${envio.inbound_id}?`)) return;
                  void correr(() => registrarSalidaEnvioMl(envio.inbound_id, fechaSalida || null, bodegaId || null), "Listo: ya se descontó de tu bodega.");
                }}
                className={btnPri}
              >
                Descontar de mi bodega
              </button>
              <button
                type="button"
                disabled={enviando}
                onClick={() => {
                  if (!window.confirm("¿Este envío NO salió de tu bodega (ej. una devolución que llegó a Full)? No se descuenta nada.")) return;
                  void correr(() => ignorarEnvioMl(envio.inbound_id));
                }}
                className={btnSec}
              >
                No salió de mi bodega
              </button>
            </div>
          </div>
        )}

        {/* ---- Pie: ver salidas / deshacer ---- */}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          {envio.confirmado_en && (
            <Link href="/stock/movimientos" className="text-zinc-500 underline-offset-2 hover:underline">
              ver las salidas
            </Link>
          )}
          {fase !== "CANCELADO" && (
            <button
              type="button"
              disabled={enviando}
              onClick={() => {
                if (!window.confirm(`¿Deshacer el envío ${envio.inbound_id}? Se borran sus salidas de bodega (las piezas regresan a tu stock) y el envío se quita; lo puedes volver a capturar.`)) return;
                void correr(() => deshacerEnvioMl(envio.inbound_id));
              }}
              className="text-zinc-400 hover:text-red-600"
            >
              deshacer
            </button>
          )}
        </div>
        {mensaje && <p className="mt-2 text-xs text-emerald-700">{mensaje}</p>}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-zinc-400">datos crudos</summary>
          <pre className="mt-1 max-h-48 overflow-auto rounded bg-zinc-100 p-2 text-[10px] text-zinc-600">{JSON.stringify({ envio: envio.crudo, estado: envio.estado, estado_ml: envio.estado_ml, origen: envio.origen, salio_en: envio.salio_en, confirmado_en: envio.confirmado_en, cerrado_en: envio.cerrado_en }, null, 1)}</pre>
        </details>
      </div>
    </details>
  );
}

import Link from "next/link";
import { todosLosMovimientosStock } from "@/lib/cargar-todo";
import { createClient } from "@/lib/supabase/server";
import { resumenPorSku } from "@/lib/calculos-stock";
import { obtenerPiezasPorCajaPorSku } from "@/lib/productos-stock";
import { obtenerCatalogo } from "@/lib/catalogo";
import { fechaTextoMx, formatoFechaMx } from "@/lib/fechas-mx";
import type { Bodega, ConfiguracionStock, RecepcionFull } from "@/lib/tipos";
import { devolucionesPorConfirmar, resolvedorSku, ventasPendientesPorLigar } from "@/lib/salidas-ml";
import { BotonesDevolucion, BotonProcesarAhora, InterruptorVentasMl } from "./acciones-full";
import { agruparLineas, faseDe, generarSalidasPendientesEnvios, obtenerEnviosFullMl, recepcionesSinExplicar } from "@/lib/mercadolibre-envios-full";
import { AbrirAncla } from "./abrir-ancla";
import { AvisoSinExplicar, CapturarEnvioMl, TarjetaEnvioMl, type EnvioParaPantalla } from "./envios-full-ml";

export const maxDuration = 60;

/** "21" · "oct" · "martes" (+ año si no es el actual), en horario CDMX. */
function partesFecha(iso: string) {
  const d = new Date(iso);
  const parte = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", ...o }).format(d);
  const anio = parte({ year: "numeric" });
  return {
    dia: parte({ day: "numeric" }),
    mes: parte({ month: "short" }).replace(".", ""),
    semana: parte({ weekday: "long" }),
    anio: anio !== new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", year: "numeric" }).format(new Date()) ? anio : null,
  };
}

/** Stock ↔ Mercado Libre. Envíos a Full en dos momentos (sale de bodega →
 * se descuenta; llega a Full → se concilia), salidas automáticas por ventas
 * que salen de la bodega, y devoluciones por confirmar. Regla de oro: nada
 * sale de bodega sin motivo registrado. */
export default async function FullYMercadoLibre() {
  const supabase = await createClient();
  const [{ data: movimientos }, { data: bodegas }, { data: configuracion }, piezasPorCajaPorSku, catalogo] = await Promise.all([
    todosLosMovimientosStock(supabase),
    supabase.from("bodegas").select("*").is("eliminado_en", null).order("nombre").returns<Bodega[]>(),
    supabase.from("configuracion_stock").select("*").single<ConfiguracionStock>(),
    obtenerPiezasPorCajaPorSku(supabase),
    obtenerCatalogo(supabase).catch(() => []),
  ]);
  const resumenes = resumenPorSku(movimientos ?? [], configuracion?.dias_espera ?? 60, piezasPorCajaPorSku);
  const nombrePorSku = new Map(resumenes.map((r) => [r.sku, r.nombre]));
  const stockPorSku = new Map(resumenes.map((r) => [r.sku, r]));
  const opcionesBodega = (bodegas ?? []).map((b) => ({ id: b.id, nombre: b.nombre }));
  // Productos del CRM (con foto y stock) para ligar un Código ML ahí mismo en la vista previa del envío.
  const productosCrm = new Map<string, { sku: string; nombre: string; imagenUrl: string | null; stockActual: number }>();
  for (const p of catalogo) productosCrm.set(p.sku, { sku: p.sku, nombre: p.nombre, imagenUrl: p.imagen_url, stockActual: 0 });
  for (const r of resumenes) {
    const previo = productosCrm.get(r.sku);
    productosCrm.set(r.sku, { sku: r.sku, nombre: previo?.nombre ?? r.nombre, imagenUrl: previo?.imagenUrl ?? r.imagenUrl, stockActual: r.stockActual });
  }
  const opcionesProducto = Array.from(productosCrm.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  let pendientes: Awaited<ReturnType<typeof ventasPendientesPorLigar>> = [];
  let devoluciones: Awaited<ReturnType<typeof devolucionesPorConfirmar>> = [];
  let errorLectura: string | null = null;
  try {
    [pendientes, devoluciones] = await Promise.all([ventasPendientesPorLigar(), devolucionesPorConfirmar()]);
  } catch (e) {
    errorLectura = e instanceof Error ? e.message : "No se pudo leer la información de Mercado Libre.";
  }

  // Envíos a Full (migraciones 0042 y 0049).
  let enviosMl: EnvioParaPantalla[] = [];
  let sinExplicar: RecepcionFull[] = [];
  let errorEnviosMl: string | null = null;
  try {
    let lista = await obtenerEnviosFullMl();
    // Líneas que estaban sin ligar y ya resuelven: su salida se genera aquí mismo.
    if (lista.some((e) => e.envio.confirmado_en && !e.envio.ignorado_en && e.lineas.some((l) => !l.salida_generada_en))) {
      const r = await generarSalidasPendientesEnvios();
      if (r.generadas) lista = await obtenerEnviosFullMl();
    }
    const [resolvedor, sinExp] = await Promise.all([resolvedorSku(), recepcionesSinExplicar()]);
    sinExplicar = sinExp;
    enviosMl = lista.map(({ envio, lineas }) => {
      return {
        envio,
        lineas: agruparLineas(lineas).map((l) => {
          const sku = resolvedor.skuDe(l.item_id, l.variation_id, l.seller_sku, l.inventory_id);
          const r = sku ? stockPorSku.get(sku) : undefined;
          return {
            ...l,
            sku,
            nombreCrm: r?.nombre ?? null,
            stockBodega: r?.stockActual ?? null,
            factor: resolvedor.factorDe(l.item_id, l.variation_id, l.seller_sku, l.inventory_id),
          };
        }),
      };
    });
  } catch (e) {
    errorEnviosMl = e instanceof Error ? e.message : "No se pudieron leer los envíos a Full.";
  }
  const porFase = (fases: string[]) => enviosMl.filter((e) => fases.includes(faseDe(e.envio)));
  const porCerrar = porFase(["POR_CERRAR"]);
  const pendientesRegistrar = porFase(["PENDIENTE_REGISTRAR"]);
  const enCamino = porFase(["EN_CAMINO"]);
  const cerrados = porFase(["CERRADO", "IGNORADO", "CANCELADO"]);
  // Historial compacto (Isaac, 21 oct: "nada más el número de full, la
  // cantidad de piezas y la fecha, para ir viendo cuáles ya están registrados").
  const ESTADO_HISTORIAL: Record<string, { texto: string; clase: string }> = {
    EN_CAMINO: { texto: "En camino", clase: "bg-[#2D3277]/5 text-[#2D3277]" },
    POR_CERRAR: { texto: "Diferencias por resolver", clase: "bg-amber-50 text-amber-700" },
    PENDIENTE_REGISTRAR: { texto: "Falta descontar", clase: "bg-amber-50 text-amber-700" },
    CERRADO: { texto: "Cerrado", clase: "bg-emerald-50 text-emerald-700" },
    IGNORADO: { texto: "No salió de bodega", clase: "bg-zinc-100 text-zinc-500" },
    CANCELADO: { texto: "Cancelado", clase: "bg-red-50 text-red-700" },
  };
  const historial = enviosMl
    .map((e) => ({
      id: e.envio.inbound_id,
      etiqueta: typeof e.envio.crudo?.etiqueta === "string" ? e.envio.crudo.etiqueta : null,
      fecha: e.envio.salio_en ?? e.envio.fecha_creacion ?? e.envio.actualizado_en,
      piezas: e.lineas.reduce((t, l) => t + (l.planeadas ?? l.recibidas), 0),
      recibidas: e.envio.cerrado_en ? e.lineas.reduce((t, l) => t + l.recibidas, 0) : null,
      fase: faseDe(e.envio),
    }))
    .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
  const piezasEnCamino = enCamino.reduce((s, e) => s + e.lineas.reduce((t, l) => t + (l.planeadas ?? l.recibidas) * (l.factor || 1), 0), 0);

  const desde = configuracion?.salidas_ml_desde ?? null;
  const hoyTexto = fechaTextoMx(new Date());
  const salidasMl = (movimientos ?? []).filter((m) => m.orden_ml_id && m.tipo === "SALIDA");
  const salidasHoy = salidasMl.filter((m) => fechaTextoMx(new Date(m.creado_en)) === hoyTexto).reduce((s, m) => s + m.cantidad, 0);

  const avisosVentas = pendientes.length + devoluciones.length;
  const grupo = (titulo: string, lista: EnvioParaPantalla[], tono: "ambar" | "normal" = "normal") =>
    lista.length > 0 && (
      <div className="space-y-3">
        <h3 className={`text-xs font-semibold uppercase tracking-wider ${tono === "ambar" ? "text-amber-700" : "text-zinc-400"}`}>
          {titulo} · {lista.length}
        </h3>
        {lista.map((e) => (
          <TarjetaEnvioMl key={e.envio.inbound_id} datos={e} bodegas={opcionesBodega} />
        ))}
      </div>
    );

  return (
    <div className="space-y-12">
      {errorLectura && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorLectura} — si dice que falta una tabla, corre el SQL 0035 en Supabase.</div>
      )}

      {/* ---- Envíos a Full ---- */}
      <section id="envios-ml" className="space-y-8">
        <AbrirAncla />
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-900">Envíos a Full</h2>
          <p className="mt-1 text-base text-zinc-500">Pega el envío cuando sale de tu bodega y ciérralo cuando Mercado Libre lo reciba.</p>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              { valor: enCamino.length, etiqueta: "En camino", detalle: piezasEnCamino > 0 ? `${piezasEnCamino.toLocaleString("es-MX")} pzas` : null },
              { valor: porCerrar.length + pendientesRegistrar.length, etiqueta: "Por resolver", detalle: null, alerta: porCerrar.length + pendientesRegistrar.length > 0 },
              { valor: historial.length, etiqueta: "Registrados", detalle: null },
            ].map((c) => (
              <div key={c.etiqueta} className={`rounded-2xl border px-4 py-3 ${c.alerta ? "border-amber-200 bg-amber-50/70" : "border-zinc-200/80 bg-white"}`}>
                <p className={`text-2xl font-semibold tabular-nums tracking-tight ${c.alerta ? "text-amber-700" : "text-zinc-900"}`}>{c.valor.toLocaleString("es-MX")}</p>
                <p className="text-xs font-medium text-zinc-500">
                  {c.etiqueta}
                  {c.detalle && <span className="text-zinc-400"> · {c.detalle}</span>}
                </p>
              </div>
            ))}
          </div>
        </div>

        <CapturarEnvioMl bodegas={opcionesBodega} productos={opcionesProducto} />
        {errorEnviosMl && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorEnviosMl} — si dice que falta una columna o una tabla, corre los SQL 0042 y 0049 en Supabase.</div>}

        {grupo("Llegaron con diferencias", porCerrar, "ambar")}
        {grupo("Falta descontarlos de tu bodega", pendientesRegistrar, "ambar")}
        {grupo("En camino a Full", enCamino)}

        {historial.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Historial · {historial.length}</h3>
            <ul className="divide-y divide-zinc-100 overflow-hidden rounded-3xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              {historial.map((h) => {
                const f = h.fecha ? partesFecha(h.fecha) : null;
                const estado = ESTADO_HISTORIAL[h.fase] ?? { texto: h.fase, clase: "bg-zinc-100 text-zinc-500" };
                return (
                  <li key={h.id}>
                    <a href={`#envio-${h.id}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-zinc-50/80 sm:gap-6 sm:px-6">
                      <div className="w-14 shrink-0 text-center">
                        {f ? (
                          <>
                            <p className="text-3xl font-bold leading-none tracking-tight text-zinc-900">{f.dia}</p>
                            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{f.mes}</p>
                          </>
                        ) : (
                          <p className="text-sm text-zinc-300">—</p>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-base font-semibold text-zinc-900">{h.id}</p>
                        <p className="truncate text-sm text-zinc-500">
                          {f && <span className="capitalize">{f.semana}</span>}
                          {f?.anio && <span> {f.anio}</span>}
                          {h.etiqueta && <span> · {h.etiqueta}</span>}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-lg font-semibold tabular-nums text-zinc-900">
                          {h.piezas.toLocaleString("es-MX")} <span className="text-sm font-normal text-zinc-400">pzas</span>
                        </p>
                        {h.recibidas !== null && h.recibidas !== h.piezas && <p className="text-xs text-zinc-400">ML recibió {h.recibidas.toLocaleString("es-MX")}</p>}
                        <span className={`mt-1 inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium ${estado.clase}`}>{estado.texto}</span>
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {cerrados.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer select-none text-sm text-zinc-400 hover:text-zinc-700">
              <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
              Ver el detalle de los envíos cerrados ({cerrados.length})
            </summary>
            <div className="mt-3 space-y-3">
              {cerrados.map((e) => (
                <TarjetaEnvioMl key={e.envio.inbound_id} datos={e} bodegas={opcionesBodega} />
              ))}
            </div>
          </details>
        )}
      </section>

      {/* ---- Ventas de ML que salen de bodega (secundario, cerrado) ---- */}
      <details className="group rounded-3xl border border-zinc-200/80 bg-white" open={devoluciones.length > 0}>
        <summary className="flex cursor-pointer select-none items-center justify-between gap-3 px-6 py-4">
          <span className="text-base font-semibold text-zinc-900">
            <span className="mr-2 inline-block text-zinc-400 transition-transform group-open:rotate-90">▸</span>
            Ventas de ML que salen de tu bodega
          </span>
          {avisosVentas > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">{avisosVentas} por revisar</span>}
        </summary>
      <section className="space-y-3 border-t border-zinc-100 px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm text-zinc-500">Colecta, Flex, Punto de envío y Acordado: cuando el envío ya salió, la salida se registra sola, ligada al número de venta. Las ventas desde Full las descuenta Mercado Libre.</p>
          </div>
          <BotonProcesarAhora />
        </div>
        <div className={`rounded-2xl border p-5 ${desde ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white"}`}>
          <p className="text-sm font-medium text-zinc-900">
            {desde ? <>Salidas automáticas activas desde el {formatoFechaMx(`${desde}T12:00:00-06:00`)}</> : "Salidas automáticas apagadas"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {desde
              ? `Hoy salieron ${salidasHoy.toLocaleString("es-MX")} piezas por ventas de ML. Las ventas anteriores a esa fecha no generan salidas.`
              : "Elige la fecha de arranque (el día que hiciste tu conteo físico) y actívalas. Las ventas anteriores no se tocan."}
          </p>
          <div className="mt-3">
            <InterruptorVentasMl desde={desde} hoyTexto={hoyTexto} />
          </div>
        </div>

        {pendientes.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-medium text-amber-900">{pendientes.length} venta(s) esperando liga: la publicación no está ligada a un producto del CRM</p>
            <p className="text-xs text-amber-800">
              No se pierden: en cuanto ligues el producto en <Link href="/mercadolibre/skus" className="underline">Mercado Libre → Ligar SKUs</Link>, sus salidas se generan solas en la siguiente revisión.
            </p>
            <ul className="mt-2 space-y-1 text-xs text-amber-900">
              {pendientes.slice(0, 20).map((p) => (
                <li key={p.orden.id}>
                  Venta #{p.orden.id} · {formatoFechaMx(p.orden.fecha_creacion)} · {p.sinLigar.map((i) => `${i.titulo ?? i.item_id} ×${i.cantidad}`).join(", ")}
                </li>
              ))}
              {pendientes.length > 20 && <li>… y {pendientes.length - 20} más</li>}
            </ul>
          </div>
        )}

        {devoluciones.length > 0 && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-zinc-900">Devoluciones por confirmar ({devoluciones.length})</p>
            <p className="text-xs text-zinc-500">Estas ventas ya habían salido de bodega y Mercado Libre las canceló. Cuando te llegue la pieza de regreso, confírmalo aquí.</p>
            <ul className="mt-3 divide-y divide-zinc-100">
              {devoluciones.map(({ orden, items }) => (
                <li key={orden.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                  <div>
                    <p className="text-zinc-900">
                      Venta #{orden.id} · {formatoFechaMx(orden.fecha_creacion)} · {orden.comprador_nickname ?? ""}
                    </p>
                    <p className="text-xs text-zinc-400">{items.map((i) => `${i.titulo ?? i.item_id} ×${i.cantidad}`).join(", ")}</p>
                  </div>
                  <BotonesDevolucion ordenId={orden.id} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {salidasMl.length > 0 && (
          <details className="group rounded-2xl border border-zinc-200 bg-zinc-50/60">
            <summary className="cursor-pointer select-none px-5 py-3 text-sm text-zinc-500 hover:text-zinc-800">
              <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
              Últimas salidas por ventas de ML ({salidasMl.length.toLocaleString("es-MX")})
            </summary>
            <ul className="divide-y divide-zinc-100 px-5 pb-3 text-xs text-zinc-600">
              {[...salidasMl]
                .sort((a, b) => b.creado_en.localeCompare(a.creado_en))
                .slice(0, 40)
                .map((m) => (
                  <li key={m.id} className="flex justify-between py-1.5">
                    <span>
                      {formatoFechaMx(m.creado_en)} · {nombrePorSku.get(m.sku) ?? m.nombre} · {m.referencia}
                    </span>
                    <span className="font-medium text-zinc-900">−{m.cantidad}</span>
                  </li>
                ))}
            </ul>
          </details>
        )}
      </section>
      </details>

      <AvisoSinExplicar recepciones={sinExplicar} />

      <p className="text-xs text-zinc-400">
        Lo que no viene de Mercado Libre (muestras, paquetería fuera de ML, ajustes) se sigue registrando en <Link href="/stock/salidas" className="underline">Salidas</Link>. Las ventas directas ya descuentan solas.
      </p>
    </div>
  );
}

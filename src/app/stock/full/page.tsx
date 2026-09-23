import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resumenPorSku } from "@/lib/calculos-stock";
import { obtenerPiezasPorCajaPorSku } from "@/lib/productos-stock";
import { fechaTextoMx, formatoFechaMx } from "@/lib/fechas-mx";
import { formatoFecha } from "@/lib/formato";
import type { Bodega, ConfiguracionStock, MovimientoStock } from "@/lib/tipos";
import { devolucionesPorConfirmar, enCaminoAFullPorSku, obtenerEnviosFull, obtenerRecepcionesPendientes, ventasPendientesPorLigar } from "@/lib/salidas-ml";
import { BotonCancelarEnvio, BotonesDevolucion, BotonesDiferencia, BotonProcesarAhora, InterruptorVentasMl } from "./acciones-full";
import { FormularioEnvioFull } from "./formulario-envio-full";
import { TarjetaRecepcion } from "./tarjeta-recepcion";
import { ConfirmarEnvio } from "./confirmar-envio";

export const maxDuration = 60;

/** Stock ↔ Mercado Libre: envíos a Full (la bodega se descuenta cuando ML
 * confirma), salidas automáticas por ventas que salen de la bodega, y las
 * devoluciones por confirmar. Regla de oro: nada sale sin motivo. */
export default async function FullYMercadoLibre() {
  const supabase = await createClient();
  const [{ data: movimientos }, { data: bodegas }, { data: configuracion }, piezasPorCajaPorSku] = await Promise.all([
    supabase.from("movimientos_stock").select("*").returns<MovimientoStock[]>(),
    supabase.from("bodegas").select("*").is("eliminado_en", null).order("nombre").returns<Bodega[]>(),
    supabase.from("configuracion_stock").select("*").single<ConfiguracionStock>(),
    obtenerPiezasPorCajaPorSku(supabase),
  ]);
  const resumenes = resumenPorSku(movimientos ?? [], configuracion?.dias_espera ?? 60, piezasPorCajaPorSku);
  const nombrePorSku = new Map(resumenes.map((r) => [r.sku, r.nombre]));

  let recepciones: Awaited<ReturnType<typeof obtenerRecepcionesPendientes>> = [];
  let envios: Awaited<ReturnType<typeof obtenerEnviosFull>> = [];
  let pendientes: Awaited<ReturnType<typeof ventasPendientesPorLigar>> = [];
  let devoluciones: Awaited<ReturnType<typeof devolucionesPorConfirmar>> = [];
  let errorLectura: string | null = null;
  try {
    [recepciones, envios, pendientes, devoluciones] = await Promise.all([obtenerRecepcionesPendientes(), obtenerEnviosFull(), ventasPendientesPorLigar(), devolucionesPorConfirmar()]);
  } catch (e) {
    errorLectura = e instanceof Error ? e.message : "No se pudo leer la información de Mercado Libre.";
  }

  const enCamino = enCaminoAFullPorSku(envios);
  const totalEnCamino = Array.from(enCamino.values()).reduce((s, v) => s + v, 0);
  const desde = configuracion?.salidas_ml_desde ?? null;
  const hoyTexto = fechaTextoMx(new Date());
  const salidasMl = (movimientos ?? []).filter((m) => m.orden_ml_id && m.tipo === "SALIDA");
  const salidasHoy = salidasMl.filter((m) => fechaTextoMx(new Date(m.creado_en)) === hoyTexto).reduce((s, m) => s + m.cantidad, 0);
  const enviosPreparados = envios.filter((e) => e.envio.estado === "PREPARADO");
  // Envíos en camino primero; los ya recibidos abajo, colapsados.
  const enviosOrdenados = [...enviosPreparados, ...envios.filter((e) => e.envio.estado !== "PREPARADO")];
  // Lo que ML ya detectó recibido, por SKU: solo una pista al confirmar un envío.
  const mlReporta: Record<string, number> = {};
  for (const r of recepciones) if (r.sku_crm) mlReporta[r.sku_crm] = (mlReporta[r.sku_crm] ?? 0) + r.cantidad;
  const opcionesProducto = resumenes.map((r) => ({ sku: r.sku, nombre: r.nombre, stockActual: r.stockActual, piezasPorCaja: r.piezasPorCaja, imagenUrl: r.imagenUrl }));

  return (
    <div className="space-y-8">
      {errorLectura && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorLectura} — si dice que falta una tabla, corre el SQL 0035 en Supabase.</div>
      )}

      {/* ---- Envíos a Full ---- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Envíos a Full</h2>
            <p className="text-sm text-zinc-500">
              {totalEnCamino > 0 ? <>{totalEnCamino.toLocaleString("es-MX")} piezas en camino a Full (todavía cuentan en tu bodega). Cuando ML te lo confirme, da por recibido el envío completo.</> : "Arma aquí lo que vas a mandar; cuando Mercado Libre lo reciba, lo das por recibido completo y la bodega se descuenta de un jalón."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BotonProcesarAhora />
            <FormularioEnvioFull opciones={opcionesProducto} bodegas={bodegas ?? []} />
          </div>
        </div>
        {envios.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-400">Todavía no hay envíos registrados.</p>
        ) : (
          <div className="space-y-3">
            {enviosOrdenados.map(({ envio, lineas }) => {
              const enviadas = lineas.reduce((s, l) => s + l.cantidad_enviada, 0);
              const recibidas = lineas.reduce((s, l) => s + l.cantidad_recibida, 0);
              return (
                <details key={envio.id} open={envio.estado === "PREPARADO"} className="group rounded-2xl border border-zinc-200 bg-white shadow-sm">
                  <summary className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-block transition-transform group-open:rotate-90">▸</span>
                      <div>
                        <p className="text-sm font-medium text-zinc-900">
                          Envío #{envio.numero} · {formatoFecha(envio.fecha)}
                          {envio.color_etiqueta && <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">{envio.color_etiqueta}</span>}
                        </p>
                        <p className="text-xs text-zinc-400">
                          {lineas.length} producto(s) · {recibidas.toLocaleString("es-MX")} de {enviadas.toLocaleString("es-MX")} piezas confirmadas por ML{envio.notas ? ` · ${envio.notas}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${envio.estado === "RECIBIDO" ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-amber-50 text-amber-700 ring-amber-600/20"}`}>
                      {envio.estado === "RECIBIDO" ? "Recibido en Full" : "En camino"}
                    </span>
                  </summary>
                  <div className="border-t border-zinc-100 px-5 py-3">
                    <ul className="divide-y divide-zinc-50">
                      {lineas.map((l) => {
                        const faltante = l.cantidad_enviada - l.cantidad_recibida - l.merma;
                        return (
                          <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                            <div className="flex items-center gap-3">
                              {l.imagen_url ? (
                                // eslint-disable-next-line @next/next/no-img-element -- miniatura
                                <img src={l.imagen_url} alt="" className="h-9 w-9 rounded-lg object-cover" />
                              ) : (
                                <div className="h-9 w-9 rounded-lg bg-zinc-100" />
                              )}
                              <div>
                                <p className="text-zinc-900">{l.nombre}</p>
                                <p className="text-xs text-zinc-400">{l.sku}</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs">
                              <span className="text-zinc-500">
                                enviadas <strong className="text-zinc-900">{l.cantidad_enviada}</strong> · confirmadas <strong className="text-emerald-700">{l.cantidad_recibida}</strong>
                                {l.merma > 0 && <> · merma <strong className="text-red-600">{l.merma}</strong></>}
                              </span>
                              {!l.resuelta && faltante > 0 && l.cantidad_recibida > 0 && <BotonesDiferencia lineaId={l.id} faltante={faltante} />}
                              {!l.resuelta && l.cantidad_recibida === 0 && <span className="text-zinc-400">en camino</span>}
                              {l.resuelta && <span className="text-emerald-700">✓</span>}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {envio.estado === "PREPARADO" && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <ConfirmarEnvio envioId={envio.id} numero={envio.numero} lineas={lineas} mlReporta={mlReporta} />
                        {recibidas === 0 && <BotonCancelarEnvio envioId={envio.id} numero={envio.numero} />}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- Entradas a Full que detectó ML y no cuadran con ningún envío ---- */}
      {recepciones.length > 0 && (
        <details className="group rounded-2xl border border-zinc-200 bg-zinc-50/60">
          <summary className="cursor-pointer select-none px-5 py-3 text-sm text-zinc-600 hover:text-zinc-900">
            <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
            Mercado Libre detectó {recepciones.length} entrada(s) a Full por producto — normalmente se explican al dar por recibido un envío; revisa aquí solo las que no cuadren (ej. una devolución que llegó a Full)
          </summary>
          <div className="grid gap-3 px-3 pb-3">
            {recepciones.map((r) => (
              <TarjetaRecepcion
                key={r.id}
                recepcion={r}
                enviosPreparados={enviosPreparados.map((e) => ({ id: e.envio.id, etiqueta: `Envío #${e.envio.numero} · ${formatoFecha(e.envio.fecha)}${e.envio.color_etiqueta ? ` · ${e.envio.color_etiqueta}` : ""}`, skus: e.lineas.filter((l) => !l.resuelta).map((l) => l.sku) }))}
                productos={resumenes.map((r) => ({ sku: r.sku, nombre: r.nombre }))}
              />
            ))}
          </div>
        </details>
      )}

      {/* ---- Ventas de ML que salen de bodega ---- */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Ventas de Mercado Libre que salen de tu bodega</h2>
          <p className="text-sm text-zinc-500">Colecta, Flex, Punto de envío y Acordado: cuando el envío ya salió, la salida se registra sola, ligada al número de venta.</p>
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
              No se pierden: en cuanto ligues el producto en <Link href="/mercadolibre/stock?filtro=sinligar" className="underline">Mercado Libre → Stock</Link>, sus salidas se generan solas en la siguiente revisión.
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

      <p className="text-xs text-zinc-400">
        Lo que no viene de Mercado Libre (muestras, paquetería fuera de ML, ajustes) se sigue registrando en <Link href="/stock/salidas" className="underline">Salidas</Link>. Las ventas directas ya descuentan solas.
      </p>
    </div>
  );
}

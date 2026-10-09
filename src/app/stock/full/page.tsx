import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resumenPorSku } from "@/lib/calculos-stock";
import { obtenerPiezasPorCajaPorSku } from "@/lib/productos-stock";
import { fechaTextoMx, formatoFechaMx } from "@/lib/fechas-mx";
import type { Bodega, ConfiguracionStock, MovimientoStock, RecepcionFull } from "@/lib/tipos";
import { devolucionesPorConfirmar, obtenerRecepcionesPendientes, resolvedorSku, ventasPendientesPorLigar } from "@/lib/salidas-ml";
import { BotonesDevolucion, BotonProcesarAhora, InterruptorVentasMl } from "./acciones-full";
import { agruparLineas, faseDe, generarSalidasPendientesEnvios, obtenerEnviosFullMl, recepcionesSinExplicar, subidasDetectadas } from "@/lib/mercadolibre-envios-full";
import { AvisoSkusPendientes } from "@/app/mercadolibre/skus/aviso-skus";
import { AvisoSinExplicar, CapturarEnvioMl, TarjetaEnvioMl, type EnvioParaPantalla } from "./envios-full-ml";

export const maxDuration = 60;

/** Stock ↔ Mercado Libre. Envíos a Full en dos momentos (sale de bodega →
 * se descuenta; llega a Full → se concilia), salidas automáticas por ventas
 * que salen de la bodega, y devoluciones por confirmar. Regla de oro: nada
 * sale de bodega sin motivo registrado. */
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
  const stockPorSku = new Map(resumenes.map((r) => [r.sku, r]));
  const opcionesBodega = (bodegas ?? []).map((b) => ({ id: b.id, nombre: b.nombre }));

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
  let recepciones: RecepcionFull[] = [];
  let sinExplicar: RecepcionFull[] = [];
  let errorEnviosMl: string | null = null;
  try {
    let lista = await obtenerEnviosFullMl();
    // Líneas que estaban sin ligar y ya resuelven: su salida se genera aquí mismo.
    if (lista.some((e) => e.envio.confirmado_en && !e.envio.ignorado_en && e.lineas.some((l) => !l.salida_generada_en))) {
      const r = await generarSalidasPendientesEnvios();
      if (r.generadas) lista = await obtenerEnviosFullMl();
    }
    const [resolvedor, recs, sinExp] = await Promise.all([resolvedorSku(), obtenerRecepcionesPendientes(), recepcionesSinExplicar()]);
    recepciones = recs;
    sinExplicar = sinExp;
    enviosMl = lista.map(({ envio, lineas }) => {
      const subidas = subidasDetectadas(recepciones, envio);
      return {
        envio,
        lineas: agruparLineas(lineas).map((l) => {
          const sku = resolvedor.skuDe(l.item_id, l.variation_id, l.seller_sku);
          const r = sku ? stockPorSku.get(sku) : undefined;
          return {
            ...l,
            sku,
            nombreCrm: r?.nombre ?? null,
            stockBodega: r?.stockActual ?? null,
            factor: resolvedor.factorDe(l.item_id, l.variation_id, l.seller_sku),
            subioEnFull: l.inventory_id ? (subidas.get(l.inventory_id) ?? 0) : 0,
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
  const piezasEnCamino = enCamino.reduce((s, e) => s + e.lineas.reduce((t, l) => t + (l.planeadas ?? l.recibidas) * (l.factor || 1), 0), 0);

  const desde = configuracion?.salidas_ml_desde ?? null;
  const hoyTexto = fechaTextoMx(new Date());
  const salidasMl = (movimientos ?? []).filter((m) => m.orden_ml_id && m.tipo === "SALIDA");
  const salidasHoy = salidasMl.filter((m) => fechaTextoMx(new Date(m.creado_en)) === hoyTexto).reduce((s, m) => s + m.cantidad, 0);

  return (
    <div className="space-y-8">
      {errorLectura && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorLectura} — si dice que falta una tabla, corre el SQL 0035 en Supabase.</div>
      )}

      <AvisoSkusPendientes skusCrm={new Set(resumenes.map((r) => r.sku))} />

      {/* ---- Envíos a Full ---- */}
      <section id="envios-ml" className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Envíos a Full</h2>
          <p className="text-sm text-zinc-500">
            Cuando un envío sale de tu bodega, pega aquí la tabla del panel de Mercado Libre: se descuenta en ese momento con las piezas declaradas. Cuando ML lo recibe, lo cierras con un clic (o pegas la tabla si hubo diferencias).
            {piezasEnCamino > 0 && (
              <>
                {" "}
                Ahora mismo van <strong className="text-zinc-700">{piezasEnCamino.toLocaleString("es-MX")} piezas</strong> en camino a Full.
              </>
            )}
          </p>
        </div>
        <CapturarEnvioMl bodegas={opcionesBodega} />
        {errorEnviosMl && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorEnviosMl} — si dice que falta una columna o una tabla, corre los SQL 0042 y 0049 en Supabase.</div>}
        <AvisoSinExplicar recepciones={sinExplicar} />

        {porCerrar.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-amber-800">Llegaron a Full con diferencias por resolver ({porCerrar.length})</h3>
            {porCerrar.map((e) => (
              <TarjetaEnvioMl key={e.envio.inbound_id} datos={e} bodegas={opcionesBodega} />
            ))}
          </div>
        )}
        {pendientesRegistrar.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-amber-800">Capturados antes del cambio, falta descontarlos de bodega ({pendientesRegistrar.length})</h3>
            {pendientesRegistrar.map((e) => (
              <TarjetaEnvioMl key={e.envio.inbound_id} datos={e} bodegas={opcionesBodega} />
            ))}
          </div>
        )}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-700">En camino a Full ({enCamino.length})</h3>
          {enCamino.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-400">No hay envíos en camino. Cuando salga uno, regístralo arriba.</p>
          ) : (
            enCamino.map((e) => <TarjetaEnvioMl key={e.envio.inbound_id} datos={e} bodegas={opcionesBodega} />)
          )}
        </div>
        {cerrados.length > 0 && (
          <details className="group rounded-2xl border border-zinc-200 bg-zinc-50/60">
            <summary className="cursor-pointer select-none px-5 py-3 text-sm text-zinc-500 hover:text-zinc-800">
              <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
              Envíos cerrados ({cerrados.length})
            </summary>
            <div className="space-y-3 px-2 pb-2">
              {cerrados.map((e) => (
                <TarjetaEnvioMl key={e.envio.inbound_id} datos={e} bodegas={opcionesBodega} />
              ))}
            </div>
          </details>
        )}
      </section>

      {/* ---- Ventas de ML que salen de bodega ---- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Ventas de Mercado Libre que salen de tu bodega</h2>
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

      <p className="text-xs text-zinc-400">
        Lo que no viene de Mercado Libre (muestras, paquetería fuera de ML, ajustes) se sigue registrando en <Link href="/stock/salidas" className="underline">Salidas</Link>. Las ventas directas ya descuentan solas.
      </p>
    </div>
  );
}

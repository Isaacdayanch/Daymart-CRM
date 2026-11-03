import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/servicio";
import { todasLasFilas } from "@/lib/cargar-todo";
import { faltaSqlDinero, mercadoPagoConfigurado, obtenerEstadoDineroMp, type EstadoDineroMp } from "@/lib/mercadopago-dinero";
import { netoCalculado, netoOrden, tieneDatoExacto, type MontosOrden } from "@/lib/mercadolibre-montos";
import { fechaTextoMx, formatoFechaHoraMx, inicioDelMesMx } from "@/lib/fechas-mx";
import { formatoPesos } from "@/lib/formato";
import { BotonTraer } from "./boton-traer";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DIA_MS = 86_400_000;

interface Movimiento {
  fecha: string | null;
  descripcion: string | null;
  bruto: number | null;
  comision: number | null;
  financiamiento: number | null;
  envio: number | null;
  impuestos: number | null;
  neto: number;
}

type OrdenDinero = MontosOrden & { id: number; fecha_creacion: string; comprador_nickname: string | null };

const PERIODOS = [
  { clave: "mes", etiqueta: "Este mes" },
  { clave: "pasado", etiqueta: "Mes pasado" },
  { clave: "7", etiqueta: "Últimos 7 días" },
  { clave: "30", etiqueta: "Últimos 30 días" },
] as const;

function periodo(clave: string | undefined) {
  const ahora = new Date();
  if (clave === "pasado") {
    const inicioEste = inicioDelMesMx(ahora);
    return { desde: inicioDelMesMx(new Date(inicioEste.getTime() - DIA_MS)), hasta: inicioEste, clave };
  }
  if (clave === "7" || clave === "30") return { desde: new Date(ahora.getTime() - Number(clave) * DIA_MS), hasta: ahora, clave };
  return { desde: inicioDelMesMx(ahora), hasta: ahora, clave: "mes" };
}

function tipoMovimiento(d: string | null) {
  const t = (d ?? "").toLowerCase();
  if (t.includes("withdraw") || t.includes("retiro")) return "retiro";
  if (t.includes("refund") || t.includes("chargeback") || t.includes("reembolso") || t.includes("devol") || t.includes("mediation") || t.includes("dispute")) return "devolucion";
  if (t === "" || t.includes("payment") || t.includes("pago")) return "venta";
  return "otro";
}

/** Dinero real: lo que de verdad liberó Mercado Pago (su reporte de
 * liberaciones), día por día, y el cuadre contra lo que calculaba el CRM. */
export default async function DineroReal({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { periodo: clavePeriodo } = await searchParams;
  const { desde, hasta, clave } = periodo(clavePeriodo);
  const supabase = createServiceClient();
  const llave = mercadoPagoConfigurado();

  const [estadoLeido, movsLeidos, ordenesLeidas] = await Promise.all([
    obtenerEstadoDineroMp().then(
      (e) => ({ e, error: null as string | null }),
      (err: unknown) => ({ e: null as EstadoDineroMp | null, error: err instanceof Error ? err.message : "error" }),
    ),
    todasLasFilas<Movimiento>((d, h) =>
      supabase
        .from("mercadopago_movimientos")
        .select("fecha, descripcion, bruto, comision, financiamiento, envio, impuestos, neto", { count: "exact" })
        .gte("fecha", desde.toISOString())
        .lt("fecha", hasta.toISOString())
        .order("fecha")
        .order("id")
        .range(d, h),
    ),
    todasLasFilas<OrdenDinero>((d, h) =>
      supabase
        .from("mercadolibre_ordenes")
        .select("id, fecha_creacion, comprador_nickname, total, comision, costo_envio_vendedor, pagado_comprador, envio_comprador, mp_bruto, mp_comision, mp_envio, mp_impuestos, mp_neto", { count: "exact" })
        .eq("estado", "paid")
        .gte("fecha_creacion", desde.toISOString())
        .lt("fecha_creacion", hasta.toISOString())
        .order("fecha_creacion")
        .order("id")
        .range(d, h),
    ),
  ]);

  const faltaSql = faltaSqlDinero(estadoLeido.error) || faltaSqlDinero(movsLeidos.error?.message) || faltaSqlDinero(ordenesLeidas.error?.message);
  const estado = estadoLeido.e;
  const movimientos = movsLeidos.data ?? [];
  const ordenes = ordenesLeidas.data ?? [];

  // ---- Flujo liberado en el periodo (por fecha de liberación) ----
  const t = { bruto: 0, comision: 0, envio: 0, impuestos: 0, devoluciones: 0, retiros: 0, otros: 0, neto: 0 };
  const porDia = new Map<string, { bruto: number; comision: number; envio: number; impuestos: number; devoluciones: number; neto: number; ventas: number }>();
  for (const m of movimientos) {
    const tipo = tipoMovimiento(m.descripcion);
    if (tipo === "retiro") {
      t.retiros += Math.abs(m.neto);
      continue;
    }
    const dia = m.fecha ? fechaTextoMx(new Date(m.fecha)) : "sin fecha";
    const d = porDia.get(dia) ?? { bruto: 0, comision: 0, envio: 0, impuestos: 0, devoluciones: 0, neto: 0, ventas: 0 };
    if (tipo === "venta") {
      t.bruto += m.bruto ?? 0;
      d.bruto += m.bruto ?? 0;
      d.ventas++;
    } else if (tipo === "devolucion") {
      t.devoluciones += -m.neto;
      d.devoluciones += -m.neto;
    } else t.otros += m.neto;
    const com = (m.comision ?? 0) + (m.financiamiento ?? 0);
    if (tipo !== "devolucion") {
      t.comision += com;
      t.envio += m.envio ?? 0;
      t.impuestos += m.impuestos ?? 0;
      d.comision += com;
      d.envio += m.envio ?? 0;
      d.impuestos += m.impuestos ?? 0;
    }
    t.neto += m.neto;
    d.neto += m.neto;
    porDia.set(dia, d);
  }
  const dias = Array.from(porDia.entries()).sort((a, b) => b[0].localeCompare(a[0]));

  // ---- Cuadre: ventas del periodo con dato exacto ----
  const exactas = ordenes.filter((o) => tieneDatoExacto(o));
  const cuadre = exactas.map((o) => ({ o, real: netoOrden(o), crm: netoCalculado(o) })).map((c) => ({ ...c, diferencia: Math.round((c.crm - c.real) * 100) / 100 }));
  const sumaReal = cuadre.reduce((s, c) => s + c.real, 0);
  const sumaCrm = cuadre.reduce((s, c) => s + c.crm, 0);
  const descuadradas = cuadre.filter((c) => Math.abs(c.diferencia) > 0.5).sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));

  const diaTexto = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-900">Dinero real</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Lo que de verdad te liberó Mercado Pago, sacado de su propio reporte. Sin cálculos del CRM: comisión, envío, impuestos y devoluciones tal cual te los cobraron.
          </p>
        </div>
        {llave && !faltaSql && <BotonTraer />}
      </section>

      {!llave && <ComoConectar />}
      {faltaSql && (
        <Aviso>
          Falta correr el SQL <b>0062</b> en Supabase para que funcione esta pantalla.
        </Aviso>
      )}
      {estado?.ultimo_error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Último error con Mercado Pago: {estado.ultimo_error}</div>}

      {llave && !faltaSql && (
        <p className="text-xs text-zinc-400">
          {estado?.ultima_importacion ? `Último reporte cargado: ${formatoFechaHoraMx(estado.ultima_importacion)}.` : "Todavía no se carga ningún reporte."}
          {estado?.ultima_solicitud ? ` Último pedido a Mercado Pago: ${formatoFechaHoraMx(estado.ultima_solicitud)}.` : ""} Se actualiza solo dos veces al día.
        </p>
      )}

      <nav className="flex flex-wrap gap-1">
        {PERIODOS.map((p) => (
          <Link
            key={p.clave}
            href={`/mercadolibre/dinero?periodo=${p.clave}`}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${p.clave === clave ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"}`}
          >
            {p.etiqueta}
          </Link>
        ))}
      </nav>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Lo que te liberó Mercado Pago en el periodo</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Tarjeta etiqueta="Ventas (bruto)" valor={t.bruto} />
          <Tarjeta etiqueta="Comisiones" valor={-t.comision} rojo />
          <Tarjeta etiqueta="Envíos" valor={-t.envio} rojo />
          <Tarjeta etiqueta="Impuestos retenidos" valor={-t.impuestos} rojo />
          <Tarjeta etiqueta="Devoluciones" valor={-t.devoluciones} rojo />
          <Tarjeta etiqueta="Te entró" valor={t.neto} verde grande />
        </div>
        <p className="text-xs text-zinc-400">
          Por fecha en que Mercado Pago liberó el dinero (no por fecha de venta).{t.retiros > 0 ? ` Además retiraste ${formatoPesos(t.retiros)} a tu banco (no es gasto).` : ""}
          {Math.abs(t.otros) > 0.5 ? ` Otros movimientos: ${formatoPesos(t.otros)}.` : ""}
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Cuadre: lo que calculaba el CRM contra lo real</h3>
        {exactas.length === 0 ? (
          <p className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
            Todavía ninguna venta de este periodo tiene el dato de Mercado Pago. {llave ? "Pícale a “Traer de Mercado Pago”." : ""}
          </p>
        ) : (
          <div className="rounded-3xl border border-zinc-200 bg-white p-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-zinc-500">El CRM decía que te quedaban</p>
                <p className="text-2xl font-semibold text-zinc-900">{formatoPesos(sumaCrm)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Mercado Pago dice que te quedaron</p>
                <p className="text-2xl font-semibold text-emerald-700">{formatoPesos(sumaReal)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Diferencia</p>
                <p className={`text-2xl font-semibold ${Math.abs(sumaCrm - sumaReal) > 1 ? "text-amber-700" : "text-zinc-900"}`}>{formatoPesos(sumaCrm - sumaReal)}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              {exactas.length.toLocaleString("es-MX")} de {ordenes.length.toLocaleString("es-MX")} ventas del periodo ya tienen el dato exacto
              {ordenes.length > exactas.length ? " (las más recientes llegan cuando Mercado Pago libera el dinero)" : ""}. En todas las pantallas ya se usa lo real.
              {descuadradas.length > 0 ? ` ${descuadradas.length} ventas no cuadraban.` : " Todas cuadraban."}
            </p>
            {descuadradas.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-zinc-900">Ver las que no cuadraban (las {Math.min(40, descuadradas.length)} más grandes)</summary>
                <ul className="mt-3 divide-y divide-zinc-100 text-sm">
                  {descuadradas.slice(0, 40).map((c) => (
                    <li key={c.o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <Link href={`/mercadolibre/ordenes/${c.o.id}`} className="font-mono text-xs text-zinc-600 underline">
                        #{c.o.id}
                      </Link>
                      <span className="text-xs text-zinc-400">{c.o.comprador_nickname ?? ""}</span>
                      <span className="ml-auto text-zinc-500">CRM {formatoPesos(c.crm)}</span>
                      <span className="text-emerald-700">real {formatoPesos(c.real)}</span>
                      <span className={`w-24 text-right font-medium ${c.diferencia > 0 ? "text-red-600" : "text-amber-700"}`}>{c.diferencia > 0 ? "+" : ""}{formatoPesos(c.diferencia)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>

      {dias.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Día por día</h3>
          <div className="overflow-x-auto rounded-3xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-zinc-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Día</th>
                  <th className="px-3 py-3 text-right font-medium">Ventas</th>
                  <th className="px-3 py-3 text-right font-medium">Bruto</th>
                  <th className="px-3 py-3 text-right font-medium">Comisión</th>
                  <th className="px-3 py-3 text-right font-medium">Envío</th>
                  <th className="px-3 py-3 text-right font-medium">Impuestos</th>
                  <th className="px-3 py-3 text-right font-medium">Devoluciones</th>
                  <th className="px-5 py-3 text-right font-medium">Te entró</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {dias.map(([dia, d]) => (
                  <tr key={dia}>
                    <td className="whitespace-nowrap px-5 py-2.5 font-medium text-zinc-900">{dia === "sin fecha" ? dia : diaTexto(dia)}</td>
                    <td className="px-3 py-2.5 text-right text-zinc-500">{d.ventas}</td>
                    <td className="px-3 py-2.5 text-right text-zinc-700">{formatoPesos(d.bruto)}</td>
                    <td className="px-3 py-2.5 text-right text-red-600">{d.comision ? `-${formatoPesos(d.comision)}` : "—"}</td>
                    <td className="px-3 py-2.5 text-right text-red-600">{d.envio ? `-${formatoPesos(d.envio)}` : "—"}</td>
                    <td className="px-3 py-2.5 text-right text-red-600">{d.impuestos ? `-${formatoPesos(d.impuestos)}` : "—"}</td>
                    <td className="px-3 py-2.5 text-right text-red-600">{d.devoluciones ? `-${formatoPesos(d.devoluciones)}` : "—"}</td>
                    <td className="px-5 py-2.5 text-right font-semibold text-emerald-700">{formatoPesos(d.neto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {estado?.columnas && estado.columnas.length > 0 && (
        <details className="text-xs text-zinc-400">
          <summary className="cursor-pointer">Columnas que mandó Mercado Pago (diagnóstico)</summary>
          <p className="mt-2 font-mono">{estado.columnas.join(", ")}</p>
        </details>
      )}
    </div>
  );
}

function Tarjeta({ etiqueta, valor, rojo, verde, grande }: { etiqueta: string; valor: number; rojo?: boolean; verde?: boolean; grande?: boolean }) {
  return (
    <div className={`rounded-3xl border p-4 ${verde ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white"}`}>
      <p className="text-xs text-zinc-500">{etiqueta}</p>
      <p className={`mt-1 font-semibold tracking-tight ${grande ? "text-2xl" : "text-xl"} ${verde ? "text-emerald-700" : rojo && valor !== 0 ? "text-red-600" : "text-zinc-900"}`}>{formatoPesos(valor)}</p>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{children}</div>;
}

function ComoConectar() {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-6">
      <p className="text-lg font-semibold text-zinc-900">Conecta tu cuenta de Mercado Pago (una sola vez)</p>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-600">
        <li>
          Entra a{" "}
          <a href="https://www.mercadopago.com.mx/developers/panel/app" target="_blank" rel="noreferrer" className="font-medium text-zinc-900 underline">
            mercadopago.com.mx/developers/panel/app
          </a>{" "}
          con la misma cuenta de tu tienda.
        </li>
        <li>Crea una aplicación (nombre: “Daymart CRM”).</li>
        <li>
          Dentro de la aplicación, en <b>Credenciales de producción</b>, copia el <b>Access Token</b> (empieza con <span className="font-mono">APP_USR-</span>).
        </li>
        <li>
          En Vercel → tu proyecto → Settings → Environment Variables, agrega <span className="font-mono">MERCADOPAGO_ACCESS_TOKEN</span> con ese valor y vuelve a publicar.
        </li>
      </ol>
    </div>
  );
}

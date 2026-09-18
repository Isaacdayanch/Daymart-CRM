import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

/** Actualización automática de Mercado Libre, sin que Isaac haga nada.
 *
 * La llama un reloj externo cada pocos minutos (pg_cron de Supabase con
 * pg_net, o el cron de Vercel). No usa login normal — quien llama es un
 * programa, no un navegador con sesión — así que la única puerta es la
 * clave secreta CRON_SECRET (variable de entorno en Vercel), por `?clave=`
 * o por `Authorization: Bearer` (así la manda el cron de Vercel).
 *
 * Cada llamada trabaja máximo ~40 s y guarda por dónde va; la siguiente
 * continúa. Una pasada nueva de Stock solo empieza si la última terminó
 * hace más de 55 min → en la práctica, el stock se refresca cada hora. Si
 * sobra tiempo, también atiende los avisos del webhook y refresca las
 * ventas de los últimos 2 días. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const clave = request.nextUrl.searchParams.get("clave");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return clave === secreto || bearer === secreto;
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const inicio = Date.now();
  const resultado: Record<string, unknown> = {};

  try {
    const { avanzarSyncPublicaciones } = await import("@/lib/mercadolibre-stock");
    const stock = await avanzarSyncPublicaciones({ presupuestoMs: 40000, cadaMinutos: 55 });
    resultado.stock = stock;
    if (stock.estado === "termino") {
      revalidatePath("/mercadolibre/stock");
      revalidatePath("/stock");
      revalidatePath("/");
    }
  } catch (e) {
    resultado.stock = { error: e instanceof Error ? e.message : "Falló la actualización de stock." };
  }

  // Ventas: solo si queda tiempo de sobra (las órdenes sin cambios se saltan, así que es rápido).
  if (Date.now() - inicio < 20000) {
    try {
      const { procesarNotificacionesPendientes, sincronizarOrdenes, obtenerEstadoSync } = await import("@/lib/mercadolibre-ordenes");
      const estado = await obtenerEstadoSync();
      const ultima = estado?.ultima_sync ? new Date(estado.ultima_sync).getTime() : 0;
      if (Date.now() - ultima > 10 * 60000) {
        const avisos = await procesarNotificacionesPendientes();
        const ordenes = await sincronizarOrdenes({ diasAtras: 2 });
        resultado.ventas = { avisos, ordenes };
        revalidatePath("/mercadolibre");
      } else {
        resultado.ventas = "al_dia";
      }
    } catch (e) {
      resultado.ventas = { error: e instanceof Error ? e.message : "Falló la actualización de ventas." };
    }
  }

  // Salidas automáticas por ventas de ML que ya salieron de la bodega
  // (solo si Isaac activó el interruptor con su fecha de arranque).
  try {
    const { procesarVentasMl } = await import("@/lib/salidas-ml");
    const r = await procesarVentasMl();
    resultado.salidas = { generadas: r.generadas, pendientesPorLigar: r.pendientes.length, devolucionesNuevas: r.devolucionesNuevas, activo: Boolean(r.desde) };
    if (r.generadas || r.devolucionesNuevas) {
      revalidatePath("/stock");
      revalidatePath("/stock/full");
    }
  } catch (e) {
    resultado.salidas = { error: e instanceof Error ? e.message : "Fallaron las salidas automáticas." };
  }

  return NextResponse.json({ ok: true, segundos: Math.round((Date.now() - inicio) / 1000), ...resultado });
}

import { configuracionCompleta, obtenerConexion, tokenVigente } from "@/lib/mercadolibre-auth";
import { createServiceClient } from "@/lib/supabase/servicio";
import { formatoFechaHoraMx } from "@/lib/fechas-mx";
import { RelojMx } from "./reloj-mx";
import { PanelConexion } from "./panel-conexion";

interface Notificacion {
  id: string;
  topic: string | null;
  resource: string | null;
  recibido_en: string;
}

export default async function MercadoLibre({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; cuenta?: string; error?: string }>;
}) {
  const { ok, cuenta, error } = await searchParams;
  const configurado = configuracionCompleta();

  let conexion = null;
  let notificaciones: Notificacion[] = [];
  let errorLectura: string | null = null;
  try {
    conexion = await obtenerConexion();
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("mercadolibre_notificaciones")
      .select("id, topic, resource, recibido_en")
      .order("recibido_en", { ascending: false })
      .limit(15)
      .returns<Notificacion[]>();
    notificaciones = data ?? [];
  } catch (e) {
    errorLectura = e instanceof Error ? e.message : "No se pudo leer la conexión.";
  }

  const mensajeError =
    error === "config"
      ? "Faltan las claves de Mercado Libre en Vercel (MERCADOLIBRE_APP_ID, MERCADOLIBRE_SECRET_KEY, MERCADOLIBRE_REDIRECT_URI)."
      : error === "state"
        ? "La autorización no coincidió con la que iniciamos (por seguridad se canceló). Vuelve a intentar desde el botón."
        : error === "sin_codigo"
          ? "Mercado Libre regresó sin código de autorización. Vuelve a intentar."
          : error
            ? decodeURIComponent(error)
            : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-zinc-500">
          Aquí se conecta tu cuenta de vendedor de Mercado Libre con el CRM. Una vez conectada, el sistema se mantiene
          conectado solo. Todas las horas se muestran en horario de la Ciudad de México.
        </p>
        <RelojMx />
      </div>

      {ok === "1" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          ¡Listo! Tu cuenta {cuenta ? <span className="font-semibold">{cuenta}</span> : "de Mercado Libre"} quedó conectada.
        </div>
      )}
      {mensajeError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{mensajeError}</div>
      )}
      {errorLectura && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorLectura} — si dice que falta una tabla, corre el SQL 0029 en Supabase.
        </div>
      )}

      <PanelConexion
        configurado={configurado}
        conexion={
          conexion
            ? {
                nickname: conexion.nickname,
                mlUserId: conexion.ml_user_id,
                conectadoEn: formatoFechaHoraMx(conexion.conectado_en),
                expiraEn: formatoFechaHoraMx(conexion.expira_en),
                vigente: tokenVigente(conexion),
              }
            : null
        }
      />

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">Últimos avisos de Mercado Libre</h2>
          <p className="text-xs text-zinc-500">
            Cada que hay una venta nueva o cambia una publicación o un envío, Mercado Libre le avisa al CRM. Aquí se ve
            si esos avisos están llegando.
          </p>
        </div>
        {notificaciones.length === 0 ? (
          <p className="px-6 py-4 text-sm text-zinc-400">Todavía no ha llegado ningún aviso.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {notificaciones.map((n) => (
              <li key={n.id} className="flex items-center justify-between gap-3 px-6 py-2.5 text-sm">
                <div>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">{n.topic ?? "?"}</span>
                  <span className="ml-2 font-mono text-xs text-zinc-500">{n.resource}</span>
                </div>
                <span className="text-xs text-zinc-400">{formatoFechaHoraMx(n.recibido_en)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

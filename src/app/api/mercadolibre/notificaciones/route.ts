import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/servicio";

export const dynamic = "force-dynamic";

/** Mercado Libre manda aquí un aviso cada que pasa algo (venta nueva,
 * cambio en una publicación, envío...). Hay que contestar 200 rápido (en
 * menos de 500 ms) o Mercado Libre lo reintenta; por eso solo se guarda el
 * aviso y se procesa después. Esta ruta es pública (sin login) porque quien
 * la llama es Mercado Libre, no un navegador con sesión. */
export async function POST(request: NextRequest) {
  let payload: Record<string, unknown> = {};
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    // cuerpo vacío o no JSON: se registra igual para no perder el aviso
  }

  // Solo aceptamos avisos dirigidos a NUESTRA aplicación.
  const appId = process.env.MERCADOLIBRE_APP_ID;
  const applicationId = payload.application_id != null ? String(payload.application_id) : null;
  if (appId && applicationId && applicationId !== appId) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  try {
    const supabase = createServiceClient();
    await supabase.from("mercadolibre_notificaciones").insert({
      topic: typeof payload.topic === "string" ? payload.topic : null,
      resource: typeof payload.resource === "string" ? payload.resource : null,
      ml_user_id: typeof payload.user_id === "number" ? payload.user_id : null,
      application_id: typeof payload.application_id === "number" ? payload.application_id : null,
      payload,
    });
  } catch {
    // aunque falle guardar, contestamos 200 para que Mercado Libre no
    // nos marque como caídos; el aviso se puede recuperar consultando la API
  }
  return NextResponse.json({ ok: true });
}

/** Mercado Libre a veces hace un GET para validar que la URL existe. */
export async function GET() {
  return NextResponse.json({ ok: true });
}

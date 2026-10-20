import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/servicio";
import { obtenerPerfilActual } from "@/lib/perfil";
import { todosLosMovimientosStock } from "@/lib/cargar-todo";
import { Logo } from "@/components/logo";
import { MenuMas } from "../menu-mas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Medicion {
  nombre: string;
  ms: number;
  detalle: string;
  error: string | null;
}

async function medir(nombre: string, fn: () => Promise<string>): Promise<Medicion> {
  const t = Date.now();
  try {
    const detalle = await fn();
    return { nombre, ms: Date.now() - t, detalle, error: null };
  } catch (e) {
    return { nombre, ms: Date.now() - t, detalle: "", error: e instanceof Error ? e.message : String(e) };
  }
}

/** Diagnóstico de velocidad (solo dueño): cuánto tarda cada pieza entre el
 * servidor de la página (Vercel) y la base de datos (Supabase), para saber
 * dónde se va el tiempo sin adivinar. Isaac manda captura de esto. */
export default async function Diagnostico() {
  const perfil = await obtenerPerfilActual();
  if (!perfil || perfil.rol === "operadora") notFound();
  const supabase = await createClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  const mediciones: Medicion[] = [];
  mediciones.push(
    await medir("Verificar la sesión localmente (getClaims)", async () => {
      const { data, error } = await supabase.auth.getClaims();
      if (error) throw new Error(error.message);
      const alg = data?.header?.alg ?? "?";
      return `firma ${alg}${alg === "HS256" ? " (llave antigua: cada verificación viaja al servidor de login)" : " (llave asimétrica: se verifica sin viaje)"}`;
    }),
  );
  mediciones.push(
    await medir("Verificar la sesión en el servidor de login (getUser)", async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw new Error(error.message);
      return data.user ? "sesión válida" : "sin sesión";
    }),
  );
  mediciones.push(
    await medir("Ping a Supabase (una consulta mínima: perfiles)", async () => {
      const { error } = await supabase.from("perfiles").select("rol").limit(1);
      if (error) throw new Error(error.message);
      return "respondió";
    }),
  );
  mediciones.push(
    await medir("Contar movimientos de stock", async () => {
      const { count, error } = await supabase.from("movimientos_stock").select("id", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      return `${(count ?? 0).toLocaleString("es-MX")} filas`;
    }),
  );
  mediciones.push(
    await medir("Cargar TODOS los movimientos de stock (como lo hace Stock)", async () => {
      const { data, error } = await todosLosMovimientosStock(supabase);
      if (error) throw new Error(error.message);
      return `${(data?.length ?? 0).toLocaleString("es-MX")} filas cargadas`;
    }),
  );
  mediciones.push(
    await medir("Cargar movimientos de stock SIN paginar (tope de Supabase)", async () => {
      const { data, error } = await supabase.from("movimientos_stock").select("id");
      if (error) throw new Error(error.message);
      return `${(data?.length ?? 0).toLocaleString("es-MX")} filas (si es exactamente 1,000 y arriba hay más, el tope está activo)`;
    }),
  );
  mediciones.push(
    await medir("Cargar productos de contenedores", async () => {
      const { data, error } = await supabase.from("productos").select("id");
      if (error) throw new Error(error.message);
      return `${(data?.length ?? 0).toLocaleString("es-MX")} filas`;
    }),
  );
  mediciones.push(
    await medir("Cargar publicaciones de Mercado Libre (copia local)", async () => {
      const servicio = createServiceClient();
      const { data, error } = await servicio.from("mercadolibre_publicaciones").select("*");
      if (error) throw new Error(error.message);
      return `${(data?.length ?? 0).toLocaleString("es-MX")} filas`;
    }),
  );
  mediciones.push(
    await medir("Ida y vuelta pura a Supabase (HEAD /rest/v1/)", async () => {
      const r = await fetch(`${url}/rest/v1/`, { method: "HEAD", headers: { apikey: anon }, cache: "no-store" });
      const interesantes = ["cf-ray", "x-sb-region", "sb-gateway-version", "server", "x-envoy-upstream-service-time"];
      const cabeceras = interesantes.map((h) => `${h}: ${r.headers.get(h) ?? "—"}`).join(" · ");
      return `HTTP ${r.status} · ${cabeceras}`;
    }),
  );

  const region = process.env.VERCEL_REGION ?? "(local)";
  const total = mediciones.reduce((s, m) => s + m.ms, 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Logo />
          <MenuMas rol={perfil.rol} />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-semibold text-zinc-900">Diagnóstico de velocidad</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Cuánto tarda cada pieza entre el servidor de la página y la base de datos. Mándame una captura de esta pantalla.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">Servidor de la página (Vercel) en</p>
            <p className="mt-1 font-mono text-lg font-semibold text-zinc-900">{region}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">Base de datos (Supabase)</p>
            <p className="mt-1 truncate font-mono text-sm font-semibold text-zinc-900">{url.replace(/^https?:\/\//, "")}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">Suma de todas las pruebas</p>
            <p className="mt-1 font-mono text-lg font-semibold text-zinc-900">{total.toLocaleString("es-MX")} ms</p>
          </div>
        </div>
        <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs text-zinc-500">
                <th className="px-4 py-2 font-medium">Prueba</th>
                <th className="px-4 py-2 text-right font-medium">Tiempo</th>
                <th className="px-4 py-2 font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {mediciones.map((m) => (
                <tr key={m.nombre}>
                  <td className="px-4 py-2 text-zinc-800">{m.nombre}</td>
                  <td className={`px-4 py-2 text-right font-mono ${m.ms > 800 ? "text-red-700" : m.ms > 300 ? "text-amber-700" : "text-zinc-900"}`}>{m.ms.toLocaleString("es-MX")} ms</td>
                  <td className="px-4 py-2 text-xs text-zinc-500">{m.error ? <span className="text-red-700">{m.error}</span> : m.detalle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-zinc-400">
          Referencia: una ida y vuelta a Supabase desde la misma región tarda 5–30 ms; desde otra región, 100–300 ms. Si el ping puro sale alto, lo que conviene es poner el servidor de la página en la región de la base de datos.
        </p>
      </main>
    </div>
  );
}

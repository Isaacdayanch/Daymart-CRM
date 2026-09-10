import { createClient } from "@/lib/supabase/server";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoMonto } from "@/components/campo-monto";
import { formatoPesos, formatoFecha } from "@/lib/formato";
import { totalGanancias, totalPagadoMaaser } from "@/lib/calculos-maaser";
import type { CategoriaFinanciera, MovimientoFinanciero, RegistroGanancia } from "@/lib/tipos";
import { agregarRegistroGanancia, eliminarRegistroGanancia } from "../actions";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export default async function MaaserFinanzas() {
  const supabase = await createClient();
  const [{ data: registros }, { data: categorias }, { data: movimientos }] = await Promise.all([
    supabase.from("registros_ganancia").select("*").order("fecha", { ascending: false }).returns<RegistroGanancia[]>(),
    supabase.from("categorias_financieras").select("*").returns<CategoriaFinanciera[]>(),
    supabase.from("movimientos_financieros").select("*").returns<MovimientoFinanciero[]>(),
  ]);

  const listaRegistros = registros ?? [];
  const categoriaMaaser = (categorias ?? []).find((c) => c.nombre === "Maaser");
  const pagosMaaser = (movimientos ?? [])
    .filter((m) => m.tipo === "SALIDA" && m.categoria_id === categoriaMaaser?.id)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  const ganancias = totalGanancias(listaRegistros);
  const debeTotal = ganancias * 0.1;
  const dado = totalPagadoMaaser(movimientos ?? [], categoriaMaaser?.id ?? null);
  const balance = dado - debeTotal;
  const hoyTexto = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-500">
        Registra tu ganancia neta (después de gastos) conforme la vayas calculando — de ahí se saca el 10% de
        Maaser. Los pagos de Maaser se registran igual que cualquier salida normal en &ldquo;Movimientos&rdquo;,
        eligiendo la categoría &ldquo;Maaser&rdquo;.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Ganancias registradas</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">{formatoPesos(ganancias)}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Debes en total (10%)</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">{formatoPesos(debeTotal)}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Ya has dado</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">{formatoPesos(dado)}</p>
        </div>
      </div>

      <div
        className={`rounded-2xl p-6 text-white shadow-sm ${balance >= 0 ? "bg-emerald-600" : "bg-zinc-900"}`}
      >
        <p className="text-sm font-medium opacity-90">
          {balance >= 0 ? "Vas a favor" : "Todavía debes"}
        </p>
        <p className="mt-1 text-2xl font-bold">{formatoPesos(Math.abs(balance))}</p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Registrar ganancia</h2>
        <form action={agregarRegistroGanancia} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Ganancia neta (pesos)</label>
            <CampoMonto name="monto" required className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Fecha</label>
            <CampoFecha name="fecha" defaultValue={hoyTexto} max={hoyTexto} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Notas</label>
            <input type="text" name="notas" placeholder="Ej. Ganancia de agosto" className={claseCampo} />
          </div>
          <button
            type="submit"
            className="h-fit rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700"
          >
            Agregar
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Ganancias registradas</h2>
        </div>
        {listaRegistros.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">Todavía no registras ninguna ganancia.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {listaRegistros.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-6 py-3 text-sm">
                <div>
                  <p className="font-medium text-zinc-900">{formatoPesos(r.monto)}</p>
                  <p className="text-xs text-zinc-500">
                    {formatoFecha(r.fecha)} {r.notas ? `— ${r.notas}` : ""}
                  </p>
                </div>
                <form action={eliminarRegistroGanancia.bind(null, r.id)}>
                  <button type="submit" className="text-xs font-medium text-red-600 hover:text-red-800">
                    Quitar
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Pagos de Maaser</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Para registrar uno nuevo, ve a &ldquo;Movimientos&rdquo; → &ldquo;Mandar dinero&rdquo; con categoría
            &ldquo;Maaser&rdquo;.
          </p>
        </div>
        {pagosMaaser.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">Todavía no registras ningún pago de Maaser.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {pagosMaaser.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-6 py-3 text-sm">
                <p className="text-zinc-500">
                  {formatoFecha(m.fecha)} {m.contraparte ? `— ${m.contraparte}` : ""}
                </p>
                <p className="font-medium text-zinc-900">{formatoPesos(m.monto)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

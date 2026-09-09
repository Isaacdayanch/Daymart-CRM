import { createClient } from "@/lib/supabase/server";
import { formatoPesos, formatoDolares, formatoFecha } from "@/lib/formato";
import { saldoPrestamista } from "@/lib/calculos-socios-deuda";
import type { CuentaFinanciera, MovimientoPrestamista, Prestamista } from "@/lib/tipos";
import { agregarPrestamista } from "../actions";
import { FormularioPrestamista } from "./formulario-prestamista";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export default async function PrestamistasFinanzas() {
  const supabase = await createClient();
  const [{ data: prestamistas }, { data: movimientos }, { data: cuentas }] = await Promise.all([
    supabase.from("prestamistas").select("*").order("creado_en", { ascending: true }).returns<Prestamista[]>(),
    supabase.from("movimientos_prestamista").select("*").returns<MovimientoPrestamista[]>(),
    supabase.from("cuentas_financieras").select("*").is("eliminado_en", null).returns<CuentaFinanciera[]>(),
  ]);

  const listaPrestamistas = prestamistas ?? [];
  const listaMovimientos = (movimientos ?? []).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-500">
        Cuánto te ha prestado cada quién y cuánto le has pagado — el saldo (lo que le debes todavía) es prestado
        menos pagado, por moneda.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {listaPrestamistas.map((p) => {
          const mxn = saldoPrestamista(listaMovimientos, p.id, "MXN");
          const usd = saldoPrestamista(listaMovimientos, p.id, "USD");
          return (
            <div key={p.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-zinc-900">{p.nombre}</p>
              <div className="mt-2 flex gap-4 text-sm">
                {mxn !== 0 && (
                  <p className="text-zinc-600">
                    Debes: <span className="font-medium text-zinc-900">{formatoPesos(mxn)}</span>
                  </p>
                )}
                {usd !== 0 && (
                  <p className="text-zinc-600">
                    Debes: <span className="font-medium text-zinc-900">{formatoDolares(usd)}</span>
                  </p>
                )}
                {mxn === 0 && usd === 0 && <p className="text-zinc-400">Sin saldo pendiente</p>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Nuevo prestamista</h2>
        <form action={agregarPrestamista} className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
          <input type="text" name="nombre" required placeholder="Nombre" className={claseCampo} />
          <input type="text" name="notas" placeholder="Notas (opcional)" className={claseCampo} />
          <button
            type="submit"
            className="h-fit rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Agregar
          </button>
        </form>
      </div>

      <FormularioPrestamista prestamistas={listaPrestamistas} cuentas={cuentas ?? []} />

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Historial</h2>
        </div>
        {listaMovimientos.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">Todavía no hay movimientos de préstamos.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {listaMovimientos.map((m) => {
              const p = listaPrestamistas.find((x) => x.id === m.prestamista_id);
              return (
                <div key={m.id} className="flex items-center justify-between px-6 py-3 text-sm">
                  <div>
                    <p className="font-medium text-zinc-900">
                      {p?.nombre ?? "—"} · {m.tipo === "PRESTAMO" ? "Préstamo" : "Pago"}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {formatoFecha(m.fecha)} {m.notas ? `— ${m.notas}` : ""}
                    </p>
                  </div>
                  <p className={`font-semibold ${m.tipo === "PRESTAMO" ? "text-emerald-600" : "text-zinc-900"}`}>
                    {m.tipo === "PRESTAMO" ? "+" : "-"}
                    {m.moneda === "USD" ? formatoDolares(m.monto) : formatoPesos(m.monto)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

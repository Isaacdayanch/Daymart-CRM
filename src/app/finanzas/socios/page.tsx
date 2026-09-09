import { createClient } from "@/lib/supabase/server";
import { formatoPesos, formatoDolares, formatoFecha } from "@/lib/formato";
import { saldoSocio } from "@/lib/calculos-socios-deuda";
import type { CuentaFinanciera, MovimientoSocio, Socio } from "@/lib/tipos";
import { agregarSocio } from "../actions";
import { FormularioSocio } from "./formulario-socio";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export default async function SociosFinanzas() {
  const supabase = await createClient();
  const [{ data: socios }, { data: movimientos }, { data: cuentas }] = await Promise.all([
    supabase.from("socios").select("*").order("creado_en", { ascending: true }).returns<Socio[]>(),
    supabase.from("movimientos_socio").select("*").returns<MovimientoSocio[]>(),
    supabase.from("cuentas_financieras").select("*").is("eliminado_en", null).returns<CuentaFinanciera[]>(),
  ]);

  const listaSocios = socios ?? [];
  const listaMovimientos = (movimientos ?? []).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-500">
        Cuánto ha aportado cada socio y cuánto se le ha repartido — el saldo es aportado menos repartido, por
        moneda (nunca se mezcla pesos con dólares).
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {listaSocios.map((socio) => {
          const mxn = saldoSocio(listaMovimientos, socio.id, "MXN");
          const usd = saldoSocio(listaMovimientos, socio.id, "USD");
          return (
            <div key={socio.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-zinc-900">{socio.nombre}</p>
              <div className="mt-2 flex gap-4 text-sm">
                {mxn !== 0 && (
                  <p className="text-zinc-600">
                    Pesos: <span className="font-medium text-zinc-900">{formatoPesos(mxn)}</span>
                  </p>
                )}
                {usd !== 0 && (
                  <p className="text-zinc-600">
                    Dólares: <span className="font-medium text-zinc-900">{formatoDolares(usd)}</span>
                  </p>
                )}
                {mxn === 0 && usd === 0 && <p className="text-zinc-400">Sin movimientos</p>}
              </div>
              <p className="mt-1 text-[11px] text-zinc-400">Aportado − repartido acumulado</p>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Nuevo socio</h2>
        <form action={agregarSocio} className="mt-3 flex gap-2">
          <input type="text" name="nombre" required placeholder="Nombre del socio" className={claseCampo} />
          <button
            type="submit"
            className="mt-1 shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Agregar
          </button>
        </form>
      </div>

      <FormularioSocio socios={listaSocios} cuentas={cuentas ?? []} />

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Historial</h2>
        </div>
        {listaMovimientos.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">Todavía no hay movimientos de socios.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {listaMovimientos.map((m) => {
              const socio = listaSocios.find((s) => s.id === m.socio_id);
              return (
                <div key={m.id} className="flex items-center justify-between px-6 py-3 text-sm">
                  <div>
                    <p className="font-medium text-zinc-900">
                      {socio?.nombre ?? "—"} · {m.tipo === "APORTE" ? "Aporte" : "Reparto"}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {formatoFecha(m.fecha)} {m.notas ? `— ${m.notas}` : ""}
                    </p>
                  </div>
                  <p className={`font-semibold ${m.tipo === "APORTE" ? "text-emerald-600" : "text-zinc-900"}`}>
                    {m.tipo === "APORTE" ? "+" : "-"}
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

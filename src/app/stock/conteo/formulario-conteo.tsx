"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Selector } from "@/components/selector";
import type { ResumenSku } from "@/lib/calculos-stock";
import { formatoCajas } from "@/lib/formato";
import type { Bodega } from "@/lib/tipos";
import { registrarConteoFisico } from "../actions";

function normaliza(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

interface Fila {
  revisado: boolean;
  cantidadReal: string;
}

export function FormularioConteo({ resumenes, bodegas }: { resumenes: ResumenSku[]; bodegas: Bodega[] }) {
  const [filas, setFilas] = useState<Record<string, Fila>>(
    Object.fromEntries(resumenes.map((r) => [r.sku, { revisado: false, cantidadReal: String(r.stockActual) }])),
  );
  const [busqueda, setBusqueda] = useState("");
  const [bodegaId, setBodegaId] = useState(bodegas[0]?.id ?? "");
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);

  const filtrados = useMemo(() => {
    const texto = normaliza(busqueda.trim());
    if (!texto) return resumenes;
    return resumenes.filter((r) => normaliza(r.nombre).includes(texto) || normaliza(r.sku).includes(texto));
  }, [resumenes, busqueda]);

  const revisados = Object.values(filas).filter((f) => f.revisado).length;
  const conDiferencia = resumenes.filter((r) => {
    const f = filas[r.sku];
    return f?.revisado && Number(f.cantidadReal) !== r.stockActual;
  });

  function actualizarFila(sku: string, cambios: Partial<Fila>) {
    setFilas((prev) => ({ ...prev, [sku]: { ...prev[sku], ...cambios } }));
  }

  async function guardar() {
    if (conDiferencia.length === 0) {
      setMensaje({ texto: "Marca al menos un producto revisado con una cantidad distinta a la del sistema.", error: true });
      return;
    }
    setEnviando(true);
    setMensaje(null);
    const formData = new FormData();
    formData.set("bodega_id", bodegaId);
    formData.set(
      "lineas",
      JSON.stringify(
        conDiferencia.map((r) => ({
          sku: r.sku,
          nombre: r.nombre,
          piezasPorCaja: r.piezasPorCaja,
          imagenUrl: r.imagenUrl,
          cantidadSistema: r.stockActual,
          cantidadReal: Number(filas[r.sku].cantidadReal) || 0,
        })),
      ),
    );
    const resultado = await registrarConteoFisico(formData);
    setEnviando(false);
    if (resultado?.error) {
      setMensaje({ texto: resultado.error, error: true });
    } else {
      setMensaje({ texto: `Se ajustaron ${resultado?.ajustados ?? conDiferencia.length} producto(s).`, error: false });
      setFilas((prev) => {
        const copia = { ...prev };
        for (const r of conDiferencia) copia[r.sku] = { revisado: false, cantidadReal: String(r.stockActual) };
        return copia;
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto o SKU…"
              className="rounded-full border border-zinc-300 bg-zinc-50 px-4 py-2 text-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:bg-white focus:ring-zinc-500"
            />
            <div className="w-40">
              <Selector defaultValue={bodegaId} onChange={setBodegaId} opciones={bodegas.map((b) => ({ value: b.id, label: b.nombre }))} />
            </div>
          </div>
          <Link href="/stock/imprimir" className="text-xs font-medium text-zinc-500 hover:text-zinc-900">
            Imprimir hoja de conteo →
          </Link>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Marca ✓ cada producto que ya contaste y corrige la cantidad si no coincide. Solo se guarda un ajuste
          para los que marques con una cantidad distinta a la del sistema — el resto no se toca.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-xs text-zinc-400">
                <th className="px-6 py-2.5 font-medium">✓</th>
                <th className="px-6 py-2.5 font-medium">Producto</th>
                <th className="px-6 py-2.5 font-medium text-right">Cajas</th>
                <th className="px-6 py-2.5 font-medium text-right">Sistema</th>
                <th className="px-6 py-2.5 font-medium text-right">Conteo real</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtrados.map((r) => {
                const fila = filas[r.sku];
                const difiere = fila?.revisado && Number(fila.cantidadReal) !== r.stockActual;
                return (
                  <tr key={r.sku} className={difiere ? "bg-amber-50/50" : ""}>
                    <td className="px-6 py-3">
                      <input
                        type="checkbox"
                        checked={fila?.revisado ?? false}
                        onChange={(e) => actualizarFila(r.sku, { revisado: e.target.checked })}
                        className="h-4 w-4 rounded border-zinc-300"
                      />
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        {r.imagenUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- miniatura en tabla, tamaño fijo
                          <img src={r.imagenUrl} alt={r.nombre} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-[9px] text-zinc-400">
                            Sin foto
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-zinc-900">{r.nombre}</p>
                          <p className="font-mono text-xs text-zinc-400">{r.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right text-xs text-zinc-400">
                      {r.cajas > 0 ? formatoCajas(r.cajas) : "—"}
                    </td>
                    <td className="px-6 py-3 text-right text-zinc-500">{r.stockActual}</td>
                    <td className="px-6 py-3 text-right">
                      <input
                        type="number"
                        min={0}
                        value={fila?.cantidadReal ?? ""}
                        onChange={(e) => actualizarFila(r.sku, { cantidadReal: e.target.value })}
                        className={`w-20 rounded-lg border px-2 py-1 text-right text-sm font-semibold focus:ring-2 ${
                          difiere
                            ? "border-amber-300 text-amber-700 focus:border-amber-500 focus:ring-amber-200"
                            : "border-zinc-300 text-zinc-900 focus:border-zinc-500 focus:ring-zinc-200"
                        }`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 p-6">
          <p className="text-xs text-zinc-500">
            {revisados} revisado(s) · {conDiferencia.length} con diferencia
          </p>
          <div className="flex items-center gap-3">
            {mensaje && (
              <p className={`text-sm ${mensaje.error ? "text-red-600" : "text-emerald-600"}`}>{mensaje.texto}</p>
            )}
            <button
              type="button"
              disabled={enviando}
              onClick={guardar}
              className="rounded-xl bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 disabled:opacity-50"
            >
              {enviando ? "Guardando..." : `Guardar ajuste físico (${conDiferencia.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

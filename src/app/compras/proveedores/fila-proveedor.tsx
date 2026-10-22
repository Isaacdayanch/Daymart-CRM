"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Selector } from "@/components/selector";
import { BotonGuardar } from "@/components/boton-guardar";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { CONDICIONES_PAGO, type CondicionesPago, type ProveedorMx } from "@/lib/tipos";
import { actualizarProveedor, eliminarProveedor } from "../actions";

const claseInput = "block w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export function textoCondiciones(p: Pick<ProveedorMx, "condiciones_pago" | "dias_credito">) {
  if (p.condiciones_pago === "CREDITO") return `Crédito ${p.dias_credito ?? "?"} días`;
  return CONDICIONES_PAGO.find((c) => c.valor === p.condiciones_pago)?.etiqueta ?? p.condiciones_pago;
}

export function FilaProveedor({
  proveedor,
  ordenes,
  abiertas,
  comprado,
  saldo,
  ultimaFecha,
}: {
  proveedor: ProveedorMx;
  ordenes: number;
  abiertas: number;
  comprado: number;
  saldo: number;
  ultimaFecha: string | null;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [condiciones, setCondiciones] = useState<CondicionesPago>(proveedor.condiciones_pago);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  if (editando) {
    return (
      <tr>
        <td colSpan={7} className="px-5 py-3">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setGuardando(true);
              setError(null);
              const r = await actualizarProveedor(proveedor.id, new FormData(e.currentTarget));
              setGuardando(false);
              if (r.error) {
                setError(r.error);
                return;
              }
              setEditando(false);
              router.refresh();
            }}
            className="grid gap-2 sm:grid-cols-4"
          >
            <input type="text" name="nombre" defaultValue={proveedor.nombre} required placeholder="Nombre" className={claseInput} />
            <input type="text" name="contacto" defaultValue={proveedor.contacto ?? ""} placeholder="Contacto" className={claseInput} />
            <input type="text" name="telefono" defaultValue={proveedor.telefono ?? ""} placeholder="Teléfono" className={claseInput} />
            <input type="email" name="correo" defaultValue={proveedor.correo ?? ""} placeholder="Correo" className={claseInput} />
            <Selector name="condiciones_pago" defaultValue={condiciones} onChange={(v) => setCondiciones(v as CondicionesPago)} opciones={CONDICIONES_PAGO.map((c) => ({ value: c.valor, label: c.etiqueta }))} />
            {condiciones === "CREDITO" ? (
              <input type="number" name="dias_credito" defaultValue={proveedor.dias_credito ?? ""} min={1} placeholder="Días de crédito" required className={claseInput} />
            ) : (
              <div />
            )}
            <input type="text" name="rfc" defaultValue={proveedor.rfc ?? ""} placeholder="RFC" className={`${claseInput} font-mono uppercase`} />
            <input type="text" name="notas" defaultValue={proveedor.notas ?? ""} placeholder="Notas" className={claseInput} />
            {error && <p className="text-xs text-red-600 sm:col-span-4">{error}</p>}
            <div className="flex items-center gap-3 sm:col-span-4">
              <BotonGuardar cargando={guardando} textoCargando="…" className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700">
                Guardar
              </BotonGuardar>
              <button type="button" onClick={() => setEditando(false)} className="text-xs text-zinc-500 hover:text-zinc-900">
                Cancelar
              </button>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="transition hover:bg-zinc-50">
      <td className="px-5 py-3">
        <p className="font-medium text-zinc-900">{proveedor.nombre}</p>
        <p className="text-xs text-zinc-400">
          {proveedor.rfc ? `${proveedor.rfc} · ` : ""}
          {ultimaFecha ? `último pedido ${formatoFecha(ultimaFecha)}` : "sin pedidos todavía"}
          {proveedor.notas ? ` · ${proveedor.notas}` : ""}
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </td>
      <td className="px-3 py-3 text-zinc-600">
        {proveedor.contacto ?? "—"}
        {proveedor.telefono && (
          <a href={`https://wa.me/${proveedor.telefono.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="block text-xs text-emerald-700 hover:underline">
            {proveedor.telefono}
          </a>
        )}
        {proveedor.correo && <span className="block text-xs text-zinc-400">{proveedor.correo}</span>}
      </td>
      <td className="px-3 py-3 text-zinc-600">{textoCondiciones(proveedor)}</td>
      <td className="px-3 py-3 text-right tabular-nums text-zinc-600">
        {ordenes}
        {abiertas > 0 && <span className="block text-xs text-sky-700">{abiertas} en camino</span>}
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-zinc-700">{formatoPesos(comprado)}</td>
      <td className={`px-3 py-3 text-right tabular-nums ${saldo > 0.01 ? "font-medium text-amber-700" : "text-zinc-400"}`}>
        {saldo > 0.01 ? (
          <Link href="/finanzas/facturas" className="hover:underline">
            {formatoPesos(saldo)}
          </Link>
        ) : (
          "—"
        )}
      </td>
      <td className="px-5 py-3 text-right text-xs">
        <Link href={`/compras/nueva?proveedor=${proveedor.id}`} className="text-[#2D3277] hover:underline">
          + orden
        </Link>
        <button type="button" onClick={() => setEditando(true)} className="ml-3 text-zinc-500 hover:text-zinc-900">
          editar
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!window.confirm(`¿Quitar a ${proveedor.nombre} de la lista de proveedores?`)) return;
            const r = await eliminarProveedor(proveedor.id);
            if (r.error) {
              setError(r.error);
              return;
            }
            router.refresh();
          }}
          className="ml-3 text-zinc-400 hover:text-red-600"
        >
          quitar
        </button>
      </td>
    </tr>
  );
}

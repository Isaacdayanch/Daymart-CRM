"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoNumero } from "@/components/campo-numero";
import { formatoFecha } from "@/lib/formato";
import type { Vendedor } from "@/lib/tipos";
import { actualizarVendedor, cortarAccesoVendedor, eliminarVendedor, reactivarVendedor, regenerarLinksVendedor } from "../actions";

const claseCampo = "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

function BotonCopiar({ texto, etiqueta = "Copiar" }: { texto: string; etiqueta?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        } catch {
          window.prompt("Copia el link:", texto);
        }
      }}
      className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
    >
      {copiado ? "¡Copiado!" : etiqueta}
    </button>
  );
}

function TarjetaLink({ titulo, descripcion, url, whatsapp, color }: { titulo: string; descripcion: string; url: string; whatsapp: string; color: "zinc" | "emerald" }) {
  const borde = color === "emerald" ? "border-emerald-200 bg-emerald-50/60" : "border-zinc-200 bg-zinc-50";
  return (
    <div className={`rounded-xl border p-4 ${borde}`}>
      <p className="text-sm font-semibold text-zinc-900">{titulo}</p>
      <p className="mt-0.5 text-xs text-zinc-600">{descripcion}</p>
      <p className="mt-2 truncate font-mono text-[11px] text-zinc-500">{url}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <BotonCopiar texto={url} etiqueta="Copiar link" />
        <a href={`https://wa.me/?text=${encodeURIComponent(whatsapp)}`} target="_blank" rel="noreferrer" className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100">
          Mandar por WhatsApp
        </a>
        <a href={url} target="_blank" rel="noreferrer" className="text-xs text-zinc-500 hover:text-zinc-900 hover:underline">
          ver como lo ve él
        </a>
        <a href={`${url}/imprimir`} target="_blank" rel="noreferrer" className="text-xs text-zinc-500 hover:text-zinc-900 hover:underline">
          PDF
        </a>
      </div>
    </div>
  );
}

function LinksPorCategoria({ base, categorias, nombre }: { base: string; categorias: string[]; nombre: string }) {
  if (categorias.length < 2) return null;
  return (
    <details className="rounded-xl border border-zinc-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-zinc-900">Links para clientes por categoría ({categorias.length})</summary>
      <p className="mt-1 text-xs text-zinc-500">Cada link abre solo esa categoría (sin precios ni cantidades), para mandarlo directo a un cliente.</p>
      <ul className="mt-2 divide-y divide-zinc-100">
        {categorias.map((c) => {
          const url = `${base}?categoria=${encodeURIComponent(c)}`;
          return (
            <li key={c} className="flex flex-wrap items-center gap-2 py-2 text-xs">
              <span className="min-w-28 font-medium text-zinc-800">{c}</span>
              <BotonCopiar texto={url} etiqueta="Copiar link" />
              <a href={`https://wa.me/?text=${encodeURIComponent(`Catálogo de ${c} (${nombre}): ${url}`)}`} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-zinc-900 hover:underline">
                WhatsApp
              </a>
              <a href={url} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-zinc-900 hover:underline">
                ver
              </a>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export function FichaVendedor({ vendedor: v, baseUrl, categorias }: { vendedor: Vendedor; baseUrl: string; categorias: string[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cortado = Boolean(v.revocado_en);
  const linkVendedor = `${baseUrl}/catalogo/${v.token_vendedor}`;
  const linkClientes = `${baseUrl}/catalogo/${v.token_clientes}`;

  async function correr(fn: () => Promise<{ error: string | null }>, despues?: () => void) {
    setError(null);
    const r = await fn();
    if (r.error) setError(r.error);
    else {
      despues?.();
      router.refresh();
    }
  }

  const comision = [Number(v.comision_pct) > 0 && `${Number(v.comision_pct)}% del precio`, Number(v.comision_fija) > 0 && `$${Number(v.comision_fija).toLocaleString("es-MX")} por pieza`].filter(Boolean).join(" + ") || "sin comisión";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        {editando ? (
          <form
            action={(fd) => correr(() => actualizarVendedor(v.id, fd), () => setEditando(false))}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-500">Nombre</label>
              <input name="nombre" defaultValue={v.nombre} required className={claseCampo} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Teléfono</label>
              <input name="telefono" defaultValue={v.telefono ?? ""} className={claseCampo} />
            </div>
            <div className="lg:col-span-1" />
            <div>
              <label className="block text-xs font-medium text-zinc-500">Comisión (% del precio)</label>
              <CampoNumero name="comision_pct" defaultValue={Number(v.comision_pct)} className={claseCampo} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Comisión fija por pieza</label>
              <CampoNumero name="comision_fija" defaultValue={Number(v.comision_fija) || undefined} className={claseCampo} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-500">Notas</label>
              <input name="notas" defaultValue={v.notas ?? ""} className={claseCampo} />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2 lg:col-span-4">
              <input type="checkbox" name="clientes_ven_precios" defaultChecked={v.clientes_ven_precios} className="rounded border-zinc-300" />
              Sus clientes SÍ ven el precio de venta en el link para clientes
            </label>
            <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
              <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
                Guardar
              </button>
              <button type="button" onClick={() => setEditando(false)} className="text-xs text-zinc-500 hover:text-zinc-900">
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-zinc-900">{v.nombre}</h2>
                {cortado && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-inset ring-red-600/20">acceso cortado</span>}
              </div>
              <p className="text-sm text-zinc-600">
                Comisión: <span className="font-medium text-zinc-900">{comision}</span>
                {v.telefono && <> · {v.telefono}</>}
              </p>
              {v.notas && <p className="text-xs text-zinc-500">{v.notas}</p>}
              <p className="mt-1 text-xs text-zinc-400">
                Desde {formatoFecha(v.creado_en)}
                {v.ultimo_acceso_en ? ` · abrió su link ${formatoFecha(v.ultimo_acceso_en)} (${v.visitas} veces)` : " · no ha abierto su link"}
                {v.ultimo_acceso_clientes_en && ` · sus clientes: ${v.visitas_clientes} visita(s), la última ${formatoFecha(v.ultimo_acceso_clientes_en)}`}
              </p>
              <p className="text-xs text-zinc-400">Sus clientes {v.clientes_ven_precios ? "SÍ ven" : "no ven"} precios.</p>
            </div>
            <button type="button" onClick={() => setEditando(true)} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
              Editar
            </button>
          </div>
        )}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>

      {!cortado && (
        <div className="grid gap-3 sm:grid-cols-2">
          <TarjetaLink
            color="zinc"
            titulo="Link privado del vendedor"
            descripcion="Solo para él: ve precio de venta, su comisión por pieza y piezas disponibles. Desde ahí comparte el catálogo con sus clientes."
            url={linkVendedor}
            whatsapp={`Hola ${v.nombre}, este es tu link privado del catálogo de Daymart (precio y tu comisión): ${linkVendedor}`}
          />
          <TarjetaLink
            color="emerald"
            titulo="Link para sus clientes"
            descripcion={`Lo comparte el vendedor. Sin cantidades exactas${v.clientes_ven_precios ? ", con precio de venta" : " y sin precios"}.`}
            url={linkClientes}
            whatsapp={`Catálogo de productos (${v.nombre}): ${linkClientes}`}
          />
        </div>
      )}
      {!cortado && <LinksPorCategoria base={linkClientes} categorias={categorias} nombre={v.nombre} />}

      <div className="flex flex-wrap items-center gap-3 text-xs">
        {cortado ? (
          <button type="button" onClick={() => correr(() => reactivarVendedor(v.id))} className="rounded-lg bg-emerald-700 px-3 py-1.5 font-medium text-white hover:bg-emerald-800">
            Reactivar acceso
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`¿Cortar el acceso de ${v.nombre}? Sus dos links dejan de funcionar al instante.`)) void correr(() => cortarAccesoVendedor(v.id));
            }}
            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 font-medium text-red-700 hover:bg-red-50"
          >
            Cortar acceso
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (window.confirm("¿Generar links nuevos? Los links actuales dejan de servir y tendrás que mandarle el nuevo al vendedor.")) void correr(() => regenerarLinksVendedor(v.id));
          }}
          className="text-zinc-500 hover:text-zinc-900 hover:underline"
        >
          generar links nuevos
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.prompt(`Para quitar a este vendedor escribe su nombre: ${v.nombre}`) === v.nombre) void correr(() => eliminarVendedor(v.id), () => router.push("/vendedores"));
          }}
          className="text-zinc-400 hover:text-red-600 hover:underline"
        >
          quitar vendedor
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SelectorProducto } from "@/app/stock/salidas/selector-producto";
import { BotonGuardar } from "@/components/boton-guardar";
import { fusionarProductos, previsualizarFusion, type ResumenFusion } from "./actions";

export interface OpcionFusion {
  sku: string;
  nombre: string;
  stockActual: number;
  imagenUrl: string | null;
}

/** "Fusionar con otro producto" (solo dueño). Para productos duplicados
 * (caso real: los yoga blocks, 16 oct): en vez de borrar uno — que el
 * sistema no deja si ya tiene ventas o salidas de Mercado Libre —, TODO su
 * historial se pasa al bueno y el duplicado desaparece. Va en dos pasos:
 * primero se revisa qué tiene cada uno y qué va a pasar; luego se confirma
 * escribiendo el SKU que se quita. */
export function FusionarProducto({ sku, nombre, opciones, compacto = false }: { sku: string; nombre: string; opciones: OpcionFusion[]; compacto?: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [conservar, setConservar] = useState("");
  const [previa, setPrevia] = useState<{ quitar: ResumenFusion; conservar: ResumenFusion; historicoSeDescarta: boolean } | null>(null);
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const coincide = confirmacion.trim().toUpperCase() === sku.trim().toUpperCase();
  const candidatos = opciones.filter((o) => o.sku !== sku);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={compacto ? "text-[11px] text-zinc-400 hover:text-zinc-900 hover:underline" : "text-xs text-zinc-400 hover:text-zinc-900 hover:underline"}
      >
        fusionar con otro producto (es un duplicado)
      </button>
    );
  }

  const cerrar = () => {
    setAbierto(false);
    setConservar("");
    setPrevia(null);
    setConfirmacion("");
    setError(null);
  };

  return (
    <div className="w-full rounded-xl border border-violet-200 bg-violet-50/60 p-4 text-left">
      <p className="text-sm font-semibold text-violet-900">Fusionar «{nombre}» con otro producto</p>
      <p className="mt-1 text-xs text-violet-800">
        Todo lo de <span className="font-mono">{sku}</span> (movimientos de stock, ligas con Mercado Libre, precios de vendedores, contenedores, ventas) pasa al producto que elijas, y <span className="font-mono">{sku}</span> desaparece. No se borra historial: se junta.
      </p>

      <div className="mt-3">
        <label className="block text-xs font-medium text-violet-900">¿Con cuál se queda? (el producto BUENO, el que se conserva)</label>
        <div className="mt-1 max-w-md">
          <SelectorProducto
            opciones={candidatos}
            value={conservar}
            onChange={(v) => {
              setConservar(v);
              setPrevia(null);
              setError(null);
            }}
          />
        </div>
      </div>

      {!previa && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!conservar || cargando}
            onClick={async () => {
              setCargando(true);
              setError(null);
              const r = await previsualizarFusion(sku, conservar);
              setCargando(false);
              if (r.error || !r.quitar || !r.conservar) setError(r.error ?? "No se pudo revisar.");
              else setPrevia({ quitar: r.quitar, conservar: r.conservar, historicoSeDescarta: r.historicoSeDescarta ?? false });
            }}
            className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {cargando ? "Revisando…" : "Revisar qué pasaría"}
          </button>
          <button type="button" onClick={cerrar} className="text-xs text-zinc-500 hover:text-zinc-900">
            Cancelar
          </button>
        </div>
      )}

      {previa && (
        <form
          action={async (fd) => {
            setEnviando(true);
            setError(null);
            const r = await fusionarProductos(sku, conservar, fd);
            setEnviando(false);
            if (r.error) setError(r.error);
            else {
              alert(`Listo. ${(r.hechos ?? []).join("; ")}.`);
              router.push(`/stock/producto/${encodeURIComponent(r.skuConservar ?? conservar)}`);
              router.refresh();
            }
          }}
          className="mt-4 space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <TarjetaResumen titulo="Se quita" r={previa.quitar} tono="rojo" />
            <TarjetaResumen titulo="Se conserva" r={previa.conservar} tono="verde" />
          </div>
          <ul className="list-disc space-y-1 pl-5 text-xs text-violet-900">
            <li>
              Stock después de fusionar: <strong>{(previa.quitar.stock + previa.conservar.stock).toLocaleString("es-MX")} pzas</strong>
              {previa.historicoSeDescarta && <> (sin contar el histórico de «{previa.quitar.sku}», que se descarta porque «{previa.conservar.sku}» ya tiene el suyo)</>}.
              {" "}Si las dos fichas tenían cargadas las MISMAS piezas, el stock va a quedar doble: después corrígelo en la ficha con «Corregir histórico» o un ajuste.
            </li>
            {previa.quitar.ligasMl > 0 && <li>Sus {previa.quitar.ligasMl} liga(s) con Mercado Libre pasan a «{previa.conservar.sku}»: las ventas y envíos a Full futuros ya descuentan del bueno.</li>}
            {previa.quitar.contenedores.length > 0 && <li>En el contenedor {previa.quitar.contenedores.join(", ")} el producto queda con el SKU «{previa.conservar.sku}».</li>}
            {previa.quitar.precioVenta && !previa.conservar.precioVenta && <li>El precio de venta (${previa.quitar.precioVenta.toLocaleString("es-MX")}) pasa al bueno, que no tenía.</li>}
            <li>No se puede deshacer con un botón (habría que separar los movimientos a mano).</li>
          </ul>
          <label className="block text-xs font-medium text-violet-900">
            Para confirmar escribe el SKU que se QUITA: <span className="font-mono">{sku}</span>
          </label>
          <input
            name="confirmacion"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            autoComplete="off"
            placeholder={sku}
            className="block w-full rounded-lg border border-violet-300 bg-white px-3 py-2 font-mono text-sm focus:border-violet-500 focus:ring-violet-500 sm:w-72"
          />
          <div className="flex flex-wrap items-center gap-3">
            <BotonGuardar cargando={enviando} disabled={!coincide} textoCargando="Fusionando…" className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800">
              {`Fusionar: quitar ${sku} y dejar ${conservar}`}
            </BotonGuardar>
            <button type="button" onClick={() => setPrevia(null)} className="text-xs text-zinc-500 hover:text-zinc-900">
              Cambiar producto
            </button>
            <button type="button" onClick={cerrar} className="text-xs text-zinc-500 hover:text-zinc-900">
              Cancelar
            </button>
          </div>
        </form>
      )}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}

function TarjetaResumen({ titulo, r, tono }: { titulo: string; r: ResumenFusion; tono: "rojo" | "verde" }) {
  return (
    <div className={`rounded-lg border bg-white p-3 ${tono === "rojo" ? "border-red-200" : "border-emerald-200"}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${tono === "rojo" ? "text-red-700" : "text-emerald-700"}`}>{titulo}</p>
      <div className="mt-1.5 flex items-center gap-2">
        {r.imagenUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto del producto
          <img src={r.imagenUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-md bg-zinc-100" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-900">{r.nombre}</p>
          <p className="font-mono text-xs text-zinc-500">{r.sku}</p>
        </div>
      </div>
      <ul className="mt-2 space-y-0.5 text-xs text-zinc-600">
        <li>Stock hoy: <strong>{r.stock.toLocaleString("es-MX")}</strong> pzas · {r.movimientos} movimiento(s){r.historicos > 0 && <> · con histórico</>}</li>
        <li>Ligas con Mercado Libre: {r.ligasMl}</li>
        <li>Contenedores: {r.contenedores.length ? r.contenedores.join(", ") : "ninguno"}</li>
        <li>Precio de venta: {r.precioVenta ? `$${r.precioVenta.toLocaleString("es-MX")}` : "sin precio"}</li>
        {!r.enCatalogo && <li className="text-amber-700">Sin ficha en el catálogo (solo vive en movimientos)</li>}
      </ul>
    </div>
  );
}

"use client";

import { useState } from "react";
import { CampoMonto } from "@/components/campo-monto";
import { CampoNumero } from "@/components/campo-numero";
import { formatoPesos } from "@/lib/formato";
import { categoriaDesdeLink, simular } from "../actions";

interface Comision {
  tipoPublicacion: string;
  nombre: string;
  monto: number;
  porcentaje: number | null;
  fijo: number | null;
}

interface Envio {
  monto: number;
  fuente: "api" | "tabla";
  pesoFacturableKg: number | null;
}

const claseCampo = "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export function FormularioSimulador() {
  const [link, setLink] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [categoriaNombre, setCategoriaNombre] = useState<string | null>(null);
  const [titulo, setTitulo] = useState<string | null>(null);
  const [precio, setPrecio] = useState("");
  const [costo, setCosto] = useState("");
  const [envioGratis, setEnvioGratis] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comisiones, setComisiones] = useState<Comision[]>([]);
  const [envio, setEnvio] = useState<Envio | null>(null);

  async function alTraerCategoria() {
    if (!link.trim()) return;
    setBuscando(true);
    setError(null);
    const r = await categoriaDesdeLink(link.trim());
    setBuscando(false);
    if (r.error || !r.datos) {
      setError(r.error ?? "No se pudo leer el producto.");
      return;
    }
    setCategoriaId(r.datos.categoriaId ?? "");
    setCategoriaNombre(r.datos.categoriaNombre);
    setTitulo(r.datos.titulo);
    if (!precio && r.datos.precio) setPrecio(String(r.datos.precio));
  }

  const precioNum = Number(precio) || 0;
  const costoNum = Number(costo) || 0;
  const costoEnvio = envioGratis && envio ? envio.monto : 0;

  return (
    <div className="space-y-4">
      <form
        className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          setCalculando(true);
          setError(null);
          const fd = new FormData(e.currentTarget);
          fd.set("categoria_id", categoriaId);
          const r = await simular(fd);
          setCalculando(false);
          if (r.error) {
            setError(r.error);
            return;
          }
          setComisiones(r.comisiones);
          setEnvio(r.envio);
        }}
      >
        <h2 className="text-sm font-semibold text-zinc-900">1. Producto parecido en Mercado Libre</h2>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Pega el link de un producto de Mercado Libre (para tomar su categoría)"
            className={`${claseCampo} mt-0 flex-1`}
          />
          <button
            type="button"
            onClick={alTraerCategoria}
            disabled={buscando}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {buscando ? "..." : "Tomar categoría"}
          </button>
        </div>
        {categoriaId && (
          <p className="mt-1.5 text-xs text-zinc-500">
            Categoría: <span className="font-medium text-zinc-700">{categoriaNombre ?? categoriaId}</span>
            {titulo && <span className="text-zinc-400"> · de “{titulo}”</span>}
          </p>
        )}

        <h2 className="mt-6 text-sm font-semibold text-zinc-900">2. Tu precio y tu paquete</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Precio de venta</label>
            <div className="mt-1">
              <CampoMonto name="precio" value={precio} onChange={setPrecio} required />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Tu costo por pieza (opcional, para ver tu ganancia)</label>
            <div className="mt-1">
              <CampoMonto value={costo} onChange={setCosto} />
            </div>
          </div>
        </div>
        <p className="mt-4 text-xs font-medium text-zinc-500">Paquete individual (como le llega al cliente)</p>
        <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="block text-xs text-zinc-400">Largo (cm)</label>
            <CampoNumero name="largo_cm" className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs text-zinc-400">Ancho (cm)</label>
            <CampoNumero name="ancho_cm" className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs text-zinc-400">Alto (cm)</label>
            <CampoNumero name="alto_cm" className={claseCampo} />
          </div>
          <div>
            <label className="block text-xs text-zinc-400">Peso (kg)</label>
            <CampoNumero name="peso_kg" className={claseCampo} />
          </div>
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={envioGratis}
            onChange={(e) => setEnvioGratis(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
          />
          Ofrezco envío gratis (yo pago el envío)
        </label>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={calculando}
            className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {calculando ? "Consultando a Mercado Libre..." : "Calcular"}
          </button>
        </div>
      </form>

      {comisiones.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {comisiones.map((c) => {
            const teQueda = precioNum - c.monto - costoEnvio;
            const ganancia = teQueda - costoNum;
            return (
              <div key={c.tipoPublicacion} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-zinc-900">Publicación {c.nombre}</h3>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">Precio de venta</dt>
                    <dd className="text-zinc-900">{formatoPesos(precioNum)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">
                      Comisión de Mercado Libre
                      {c.porcentaje !== null && <span className="text-zinc-400"> ({c.porcentaje}%{c.fijo ? ` + ${formatoPesos(c.fijo)} fijo` : ""})</span>}
                    </dt>
                    <dd className="text-red-600">-{formatoPesos(c.monto)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">
                      Envío{envio ? (envio.fuente === "api" ? " (según Mercado Libre)" : " (tabla oficial)") : ""}
                      {envio?.pesoFacturableKg ? <span className="text-zinc-400"> · {envio.pesoFacturableKg} kg</span> : null}
                    </dt>
                    <dd className="text-red-600">{costoEnvio ? `-${formatoPesos(costoEnvio)}` : envioGratis && !envio ? "sin medidas" : "$0"}</dd>
                  </div>
                  <div className="flex justify-between border-t border-zinc-100 pt-2 font-semibold">
                    <dt className="text-zinc-900">Te queda</dt>
                    <dd className="text-zinc-900">{formatoPesos(teQueda)}</dd>
                  </div>
                  {costoNum > 0 && (
                    <>
                      <div className="flex justify-between">
                        <dt className="text-zinc-500">Tu costo por pieza</dt>
                        <dd className="text-red-600">-{formatoPesos(costoNum)}</dd>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <dt className={ganancia >= 0 ? "text-emerald-700" : "text-red-700"}>Ganancia</dt>
                        <dd className={ganancia >= 0 ? "text-emerald-700" : "text-red-700"}>
                          {formatoPesos(ganancia)} {precioNum > 0 && `(${((ganancia / precioNum) * 100).toFixed(0)}%)`}
                        </dd>
                      </div>
                    </>
                  )}
                </dl>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

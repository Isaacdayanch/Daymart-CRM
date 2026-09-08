"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { costoEnvioMercadoLibre } from "@/lib/costos-envio-ml";
import { costoEstimadoPorPiezaResearch, margenEstimadoResearch } from "@/lib/calculos-research";
import { formatoPesos } from "@/lib/formato";
import { guardarBorrador, traerDatosMercadoLibre } from "../actions";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

function num(valor: string) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

export function FormularioInvestigacion() {
  const router = useRouter();

  const [link, setLink] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [errorLink, setErrorLink] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [categoriaMlId, setCategoriaMlId] = useState<string | null>(null);
  const [categoriaMlNombre, setCategoriaMlNombre] = useState<string | null>(null);
  const [precioReferenciaMl, setPrecioReferenciaMl] = useState(0);
  const [ventasMl, setVentasMl] = useState<number | null>(null);

  const [precioVenta, setPrecioVenta] = useState("");
  const [precioCompraDolares, setPrecioCompraDolares] = useState("");
  const [tipoCambioEstimado, setTipoCambioEstimado] = useState("");
  const [piezasPorCaja, setPiezasPorCaja] = useState("1");
  const [largoCm, setLargoCm] = useState("");
  const [anchoCm, setAnchoCm] = useState("");
  const [altoCm, setAltoCm] = useState("");
  const [costoPorCbmPesos, setCostoPorCbmPesos] = useState("");

  const [paqueteLargoCm, setPaqueteLargoCm] = useState("");
  const [paqueteAnchoCm, setPaqueteAnchoCm] = useState("");
  const [paqueteAltoCm, setPaqueteAltoCm] = useState("");
  const [paquetePesoFisicoKg, setPaquetePesoFisicoKg] = useState("");

  const [comisionMlPct, setComisionMlPct] = useState("");
  const [envioGratis, setEnvioGratis] = useState(false);
  const [costoEnvioManual, setCostoEnvioManual] = useState<string | null>(null);

  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function alCalcularPaquete() {
    const piezas = num(piezasPorCaja) || 1;
    const largo = num(largoCm);
    if (!largo) return;
    // Se asume que las piezas van acomodadas en fila a lo largo de la
    // caja de importación: solo el largo se divide entre las piezas (con
    // 1 cm extra de protección); ancho y alto de una pieza sola quedan
    // igual que los de la caja completa.
    setPaqueteLargoCm((largo / piezas + 1).toFixed(1));
    setPaqueteAnchoCm(anchoCm);
    setPaqueteAltoCm(altoCm);
  }

  async function alTraerDatos() {
    if (!link.trim()) return;
    setBuscando(true);
    setErrorLink(null);
    const { datos, error: errorDatos } = await traerDatosMercadoLibre(link.trim());
    setBuscando(false);
    if (errorDatos || !datos) {
      setErrorLink(errorDatos ?? "No se pudieron traer los datos.");
      return;
    }
    setNombre(datos.nombre);
    setImagenUrl(datos.imagenUrl);
    setCategoriaMlId(datos.categoriaId);
    setCategoriaMlNombre(datos.categoriaNombre);
    setPrecioReferenciaMl(datos.precio);
    setVentasMl(datos.ventas);
    if (!precioVenta) setPrecioVenta(String(datos.precio));
  }

  const costoEnvioSugerido = costoEnvioMercadoLibre({
    pesoFisicoKg: paquetePesoFisicoKg ? num(paquetePesoFisicoKg) : null,
    largoCm: num(paqueteLargoCm),
    anchoCm: num(paqueteAnchoCm),
    altoCm: num(paqueteAltoCm),
    precioVenta: num(precioVenta),
    envioGratis,
  });
  const costoEnvioPesos = costoEnvioManual !== null ? num(costoEnvioManual) : costoEnvioSugerido;

  const costoEstimadoPiezaPesos = useMemo(
    () =>
      costoEstimadoPorPiezaResearch({
        largoCm: num(largoCm),
        anchoCm: num(anchoCm),
        altoCm: num(altoCm),
        piezasPorCaja: num(piezasPorCaja) || 1,
        costoPorCbmPesos: num(costoPorCbmPesos),
        precioCompraDolares: num(precioCompraDolares),
        tipoCambioEstimado: num(tipoCambioEstimado),
      }),
    [largoCm, anchoCm, altoCm, piezasPorCaja, costoPorCbmPesos, precioCompraDolares, tipoCambioEstimado],
  );

  const { comision, margenPesos, margenPct } = margenEstimadoResearch({
    precioVenta: num(precioVenta),
    comisionMlPct: num(comisionMlPct),
    costoEnvioPesos,
    costoEstimadoPiezaPesos,
  });

  return (
    <form
      action={async (formData) => {
        setGuardando(true);
        setError(null);
        formData.set("costo_envio_pesos", String(costoEnvioPesos));
        const resultado = await guardarBorrador(formData);
        setGuardando(false);
        if (resultado?.error) {
          setError(resultado.error);
        } else {
          router.push("/research");
        }
      }}
      className="space-y-6"
    >
      <input type="hidden" name="imagen_url" value={imagenUrl ?? ""} />
      <input type="hidden" name="categoria_ml_id" value={categoriaMlId ?? ""} />
      <input type="hidden" name="categoria_ml_nombre" value={categoriaMlNombre ?? ""} />
      <input type="hidden" name="precio_referencia_ml" value={precioReferenciaMl} />
      <input type="hidden" name="ventas_ml" value={ventasMl ?? ""} />
      <input type="hidden" name="envio_gratis" value={envioGratis ? "true" : "false"} />

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Link de Mercado Libre</h2>
        <div className="mt-3 flex gap-2">
          <input
            type="url"
            name="link_mercado_libre"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://articulo.mercadolibre.com.mx/..."
            className={claseCampo}
          />
          <button
            type="button"
            onClick={alTraerDatos}
            disabled={buscando || !link.trim()}
            className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {buscando ? "Buscando..." : "Traer datos"}
          </button>
        </div>
        {errorLink && <p className="mt-2 text-sm text-red-600">{errorLink}</p>}

        {(imagenUrl || nombre) && (
          <div className="mt-4 flex items-center gap-4 rounded-xl bg-zinc-50 p-3">
            {imagenUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- foto jalada de Mercado Libre, no de nuestro storage
              <img src={imagenUrl} alt={nombre} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="h-16 w-16 shrink-0 rounded-lg bg-zinc-200" />
            )}
            <div className="text-sm">
              <p className="font-medium text-zinc-900">{nombre || "—"}</p>
              <p className="text-xs text-zinc-500">
                {categoriaMlNombre ?? "Sin categoría"} · {formatoPesos(precioReferenciaMl)}
                {ventasMl !== null && ` · ${ventasMl} vendidos`}
              </p>
            </div>
          </div>
        )}

        <div className="mt-4">
          <label className="block text-xs font-medium text-zinc-500">Nombre del producto</label>
          <input
            type="text"
            name="nombre"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={claseCampo}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Tu costo estimado de traerlo</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Precio de compra (USD)</label>
            <input
              type="number"
              step="0.01"
              value={precioCompraDolares}
              onChange={(e) => setPrecioCompraDolares(e.target.value)}
              name="precio_compra_dolares"
              className={claseCampo}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Tipo de cambio estimado</label>
            <input
              type="number"
              step="0.01"
              value={tipoCambioEstimado}
              onChange={(e) => setTipoCambioEstimado(e.target.value)}
              name="tipo_cambio_estimado"
              className={claseCampo}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Piezas por caja</label>
            <input
              type="number"
              value={piezasPorCaja}
              onChange={(e) => setPiezasPorCaja(e.target.value)}
              name="piezas_por_caja"
              className={claseCampo}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">$/CBM estimado (pesos)</label>
            <input
              type="number"
              step="0.01"
              value={costoPorCbmPesos}
              onChange={(e) => setCostoPorCbmPesos(e.target.value)}
              name="costo_por_cbm_pesos"
              className={claseCampo}
            />
          </div>
        </div>
        <p className="mt-3 text-xs font-medium text-zinc-500">Medidas de la caja de importación (cm)</p>
        <div className="mt-1 grid grid-cols-3 gap-3">
          <input
            type="number"
            placeholder="Largo"
            value={largoCm}
            onChange={(e) => setLargoCm(e.target.value)}
            name="largo_cm"
            className={claseCampo}
          />
          <input
            type="number"
            placeholder="Ancho"
            value={anchoCm}
            onChange={(e) => setAnchoCm(e.target.value)}
            name="ancho_cm"
            className={claseCampo}
          />
          <input
            type="number"
            placeholder="Alto"
            value={altoCm}
            onChange={(e) => setAltoCm(e.target.value)}
            name="alto_cm"
            className={claseCampo}
          />
        </div>
        <p className="mt-3 text-sm text-zinc-600">
          Costo estimado por pieza: <span className="font-semibold text-zinc-900">{formatoPesos(costoEstimadoPiezaPesos)}</span>
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Venta en Mercado Libre</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Precio de venta</label>
            <input
              type="number"
              step="0.01"
              value={precioVenta}
              onChange={(e) => setPrecioVenta(e.target.value)}
              name="precio_venta"
              className={claseCampo}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">
              Comisión de Mercado Libre (%) — sácala del simulador
            </label>
            <input
              type="number"
              step="0.01"
              value={comisionMlPct}
              onChange={(e) => setComisionMlPct(e.target.value)}
              name="comision_ml_pct"
              className={claseCampo}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-zinc-500">Paquete individual (como le llega a tu cliente)</p>
          <button
            type="button"
            onClick={alCalcularPaquete}
            disabled={!largoCm}
            className="text-xs font-medium text-zinc-500 underline hover:text-zinc-900 disabled:opacity-50"
          >
            Calcular tamaño estimado →
          </button>
        </div>
        {largoCm && (
          <p className="mt-1 text-xs text-zinc-400">
            Divide el largo de la caja de importación entre las piezas por caja y le suma 1 cm de protección — asume que
            van en fila a lo largo de la caja. Revisa y ajusta si tus productos van acomodados distinto.
          </p>
        )}
        <div className="mt-1 grid grid-cols-4 gap-3">
          <input
            type="number"
            placeholder="Largo cm"
            value={paqueteLargoCm}
            onChange={(e) => setPaqueteLargoCm(e.target.value)}
            name="paquete_largo_cm"
            className={claseCampo}
          />
          <input
            type="number"
            placeholder="Ancho cm"
            value={paqueteAnchoCm}
            onChange={(e) => setPaqueteAnchoCm(e.target.value)}
            name="paquete_ancho_cm"
            className={claseCampo}
          />
          <input
            type="number"
            placeholder="Alto cm"
            value={paqueteAltoCm}
            onChange={(e) => setPaqueteAltoCm(e.target.value)}
            name="paquete_alto_cm"
            className={claseCampo}
          />
          <input
            type="number"
            placeholder="Peso real kg (opcional)"
            value={paquetePesoFisicoKg}
            onChange={(e) => setPaquetePesoFisicoKg(e.target.value)}
            name="paquete_peso_fisico_kg"
            className={claseCampo}
          />
        </div>

        <label className="mt-3 flex items-center gap-2 text-xs font-medium text-zinc-700">
          <input
            type="checkbox"
            checked={envioGratis}
            onChange={(e) => setEnvioGratis(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300"
          />
          Ofrecer envío gratis
        </label>

        <div className="mt-3">
          <label className="block text-xs font-medium text-zinc-500">
            Costo de envío propuesto (pesos) — editable
          </label>
          <input
            type="number"
            step="0.01"
            value={costoEnvioManual ?? costoEnvioSugerido.toFixed(2)}
            onChange={(e) => setCostoEnvioManual(e.target.value)}
            className={claseCampo}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-900 bg-zinc-900 p-6 text-white shadow-sm">
        <h2 className="text-sm font-semibold">Margen estimado</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-xs text-zinc-400">Costo del producto</p>
            <p className="font-semibold">{formatoPesos(costoEstimadoPiezaPesos)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400">Comisión ML</p>
            <p className="font-semibold">{formatoPesos(comision)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400">Envío</p>
            <p className="font-semibold">{formatoPesos(costoEnvioPesos)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400">Margen</p>
            <p className={`text-lg font-bold ${margenPesos >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {formatoPesos(margenPesos)} <span className="text-sm font-medium">({margenPct.toFixed(1)}%)</span>
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <label className="block text-xs font-medium text-zinc-500">Notas</label>
        <textarea
          name="notas"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={3}
          className={claseCampo}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={guardando}
          className="rounded-xl bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 disabled:opacity-50"
        >
          {guardando ? "Guardando..." : "Guardar como borrador"}
        </button>
      </div>
    </form>
  );
}

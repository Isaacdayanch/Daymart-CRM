"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoMonto } from "@/components/campo-monto";
import { CampoSugerencias } from "@/components/campo-sugerencias";
import { Selector } from "@/components/selector";
import { skuLibre, skuNuevo, skuSugerido } from "@/lib/calculos";
import { crearProductoDesdeMl } from "../actions";

const claseCampo = "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

export interface DatosMlParaProducto {
  itemId: string;
  variationId: number | null;
  titulo: string | null;
  variacion: string | null;
  imagenUrl: string | null;
  sellerSku: string | null;
  /** Publicaciones que comparten el stock (catálogo): se ligan también. */
  otras: { itemId: string; variationId: number | null }[];
}

export interface CatalogoParaNuevo {
  marcas: { id: string; nombre: string; codigo: string }[];
  categorias: string[];
  bodegas: { id: string; nombre: string }[];
  skusExistentes: string[];
}

/** "Nuevo producto con estos datos": crea el producto del CRM a partir de
 * la publicación de ML (foto y título ya vienen), Isaac solo pone marca,
 * categoría, costo y su histórico de stock, y la publicación queda ligada. */
export function NuevoProductoMl({ datos, catalogo, alCerrar }: { datos: DatosMlParaProducto; catalogo: CatalogoParaNuevo; alCerrar: () => void }) {
  const router = useRouter();
  const hoyTexto = new Date().toISOString().slice(0, 10);
  const existentes = useMemo(() => new Set(catalogo.skusExistentes), [catalogo.skusExistentes]);
  const marcaDefecto = catalogo.marcas.find((m) => m.codigo === "DAY") ?? catalogo.marcas[0];
  const [marcaId, setMarcaId] = useState(marcaDefecto?.id ?? "");
  const [categoria, setCategoria] = useState("");
  const [nombre, setNombre] = useState(datos.titulo ?? "");
  const [variante, setVariante] = useState(datos.variacion ? datos.variacion.split("·").map((x) => x.split(":").pop()?.trim() ?? "").filter(Boolean).join(" ") : "");
  const [skuManual, setSkuManual] = useState<string | null>(null);
  const [conStock, setConStock] = useState(true);
  const [entradas, setEntradas] = useState("");
  const [salidas, setSalidas] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const marca = catalogo.marcas.find((m) => m.id === marcaId);
  // El SKU se arma en vivo (marca + nombre + variante) hasta que Isaac lo edita a mano.
  const skuAuto = useMemo(() => {
    const base = marca ? skuNuevo(marca.codigo, nombre, variante) : skuSugerido(categoria, nombre);
    return base ? skuLibre(base, existentes) : "";
  }, [marca, nombre, variante, categoria, existentes]);
  const sku = skuManual ?? skuAuto;

  const quedan = (Number(entradas) || 0) - (Number(salidas) || 0);

  return (
    <form
      action={async (fd) => {
        setEnviando(true);
        setError(null);
        fd.set("item_id", datos.itemId);
        fd.set("variation_id", datos.variationId === null ? "" : String(datos.variationId));
        fd.set("otras", JSON.stringify(datos.otras));
        fd.set("imagen_url_ml", datos.imagenUrl ?? "");
        fd.set("sku", sku);
        fd.set("nombre", nombre);
        fd.set("marca_id", marcaId);
        fd.set("categoria", categoria);
        if (!conStock) {
          fd.set("entradas_total", "0");
          fd.set("salidas_total", "0");
        }
        const r = await crearProductoDesdeMl(fd);
        setEnviando(false);
        if (r.error) setError(r.error);
        else {
          alCerrar();
          router.refresh();
        }
      }}
      className="w-full space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-left lg:w-80"
    >
      <div className="flex items-center gap-3">
        {datos.imagenUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto de ML que se copiará al catálogo
          <img src={datos.imagenUrl} alt="" className="h-14 w-14 rounded-lg border border-zinc-200 object-cover" />
        ) : (
          <div className="h-14 w-14 rounded-lg bg-zinc-100" />
        )}
        <div>
          <p className="text-xs font-semibold text-zinc-900">Nuevo producto con estos datos</p>
          <p className="text-[11px] text-zinc-500">La foto y el nombre vienen de Mercado Libre; tú pones lo demás.</p>
        </div>
      </div>
      {catalogo.marcas.length === 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">No hay marcas (falta el SQL 0038): el SKU se arma con categoría + nombre.</p>}
      {catalogo.marcas.length > 0 && (
        <div>
          <label className="block text-[11px] font-medium text-zinc-500">Marca</label>
          <div className="mt-1">
            <Selector defaultValue={marcaId} onChange={setMarcaId} opciones={catalogo.marcas.map((m) => ({ value: m.id, label: `${m.nombre} (${m.codigo})` }))} />
          </div>
        </div>
      )}
      <div>
        <label className="block text-[11px] font-medium text-zinc-500">Categoría</label>
        <CampoSugerencias value={categoria} onChange={setCategoria} sugerencias={catalogo.categorias} placeholder="Gym, Hogar…" className={claseCampo} />
      </div>
      <div>
        <label className="block text-[11px] font-medium text-zinc-500">Nombre del producto</label>
        <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required className={claseCampo} />
      </div>
      <div>
        <label className="block text-[11px] font-medium text-zinc-500">Variante (opcional)</label>
        <input type="text" value={variante} onChange={(e) => setVariante(e.target.value)} placeholder="Gris, 10 kg…" className={claseCampo} />
      </div>
      <div>
        <label className="block text-[11px] font-medium text-zinc-500">SKU</label>
        <input
          type="text"
          value={sku}
          onChange={(e) => setSkuManual(e.target.value.toUpperCase())}
          required
          className={`${claseCampo} font-mono`}
        />
        {datos.sellerSku && <p className="mt-0.5 text-[10px] text-zinc-400">En ML tiene SKU {datos.sellerSku}. Recomendación: pon este SKU del CRM también en ML para que la liga sea automática.</p>}
        {existentes.has(sku) && sku && <p className="mt-0.5 text-[11px] text-amber-700">Ese SKU ya existe — usa “Ligar con producto” si es el mismo.</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] font-medium text-zinc-500">Piezas por caja</label>
          <input type="number" name="piezas_por_caja" min={1} defaultValue={1} className={claseCampo} />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-zinc-500">Costo por pieza</label>
          <CampoMonto name="costo_unitario_pesos" className={claseCampo} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-zinc-700">
        <input type="checkbox" checked={conStock} onChange={(e) => setConStock(e.target.checked)} />
        Ya tengo stock de este producto (cargar su histórico)
      </label>
      {conStock && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-emerald-200 bg-white p-2">
          <div>
            <label className="block text-[11px] font-medium text-zinc-500">Han entrado en total</label>
            <input type="number" name="entradas_total" min={1} required value={entradas} onChange={(e) => setEntradas(e.target.value)} className={claseCampo} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-zinc-500">Han salido en total</label>
            <input type="number" name="salidas_total" min={0} value={salidas} onChange={(e) => setSalidas(e.target.value)} className={claseCampo} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-zinc-500">Fecha de corte</label>
            <div className="mt-1">
              <CampoFecha name="fecha" defaultValue={hoyTexto} max={hoyTexto} />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-zinc-500">Bodega</label>
            <div className="mt-1">
              <Selector name="bodega_id" defaultValue={catalogo.bodegas[0]?.id} opciones={catalogo.bodegas.map((b) => ({ value: b.id, label: b.nombre }))} />
            </div>
          </div>
          <p className="col-span-2 text-[11px] text-emerald-800">
            Quedan en bodega: <strong>{quedan.toLocaleString("es-MX")}</strong> pzas (se guarda como histórico de antes del sistema).
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={enviando || !sku || !nombre} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {enviando ? "Creando…" : "Crear producto y ligar"}
        </button>
        <button type="button" onClick={alCerrar} className="text-xs text-zinc-500 hover:text-zinc-900">
          Cancelar
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

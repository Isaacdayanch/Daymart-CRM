// Piezas visuales del catálogo para vendedores: la tarjeta de producto (en
// pantalla) y la hoja imprimible (PDF). Las usan el link privado del
// vendedor, el link para sus clientes y la lista de precios de Isaac, para
// que todos digan exactamente lo mismo.
//
// Modos (`ModoCatalogo`):
//  - "vendedor": precio de venta + "tu comisión" + piezas exactas en bodega.
//  - "clientes": sin cantidades exactas (solo Disponible / Agotado) y sin
//    precio salvo que Isaac lo active para ese vendedor (`conPrecios`).
// Aquí NUNCA aparece un costo.

import { Logo } from "@/components/logo";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { medidasTexto, type ModoCatalogo, type ProductoVendedores } from "@/lib/catalogo-vendedores";

export interface OpcionesVista {
  modo: ModoCatalogo;
  /** Solo aplica en modo clientes: mostrar el precio de venta. */
  conPrecios?: boolean;
  /** Esconder cantidades aunque sea modo vendedor (PDF "sin cantidades"). */
  sinCantidades?: boolean;
  /** Esconder precios aunque sea modo vendedor (PDF de Isaac "sin precios"). */
  sinPrecios?: boolean;
  /** Mostrar la columna "Tu comisión" (solo en el link privado del vendedor). */
  conComision?: boolean;
}

function Foto({ p, clase }: { p: ProductoVendedores; clase: string }) {
  return p.imagenUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- foto del producto (también se imprime)
    <img src={p.imagenUrl} alt={p.nombre} className={`${clase} rounded-xl border border-zinc-100 bg-white object-contain`} />
  ) : (
    <div className={`${clase} flex items-center justify-center rounded-xl bg-zinc-100 text-xs text-zinc-400`}>Sin foto</div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | number | null | undefined }) {
  if (valor === null || valor === undefined || valor === "") return null;
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-zinc-400">{etiqueta}</dt>
      <dd className="text-sm text-zinc-800">{valor}</dd>
    </div>
  );
}

function muestraPrecio(v: OpcionesVista) {
  if (v.sinPrecios) return false;
  return v.modo === "vendedor" || Boolean(v.conPrecios);
}

export function PastillaStock({ stock, vista }: { stock: number; vista: OpcionesVista }) {
  if (vista.sinCantidades) return null;
  if (stock <= 0) return <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-500">Agotado</span>;
  return (
    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
      {vista.modo === "vendedor" ? `${stock.toLocaleString("es-MX")} disponibles` : "Disponible"}
    </span>
  );
}

/** Tarjeta para las páginas web (vendedor y clientes). */
export function TarjetaProductoVendedores({ p, vista }: { p: ProductoVendedores; vista: OpcionesVista }) {
  const medidas = medidasTexto(p);
  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <Foto p={p} clase="aspect-square w-full" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
          {p.marca && <span className="rounded-md bg-zinc-900 px-1.5 py-0.5 font-semibold text-white">{p.marca}</span>}
          {p.categoria && <span className="rounded-md bg-zinc-100 px-1.5 py-0.5">{p.categoria}</span>}
          {p.linea && <span className="rounded-md bg-zinc-100 px-1.5 py-0.5">{p.linea}</span>}
        </div>
        <h3 className="text-sm font-semibold leading-snug text-zinc-900">{p.nombre}</h3>
        <p className="font-mono text-[11px] text-zinc-400">{p.sku}</p>
        {p.descripcion && <p className="text-xs leading-relaxed text-zinc-600">{p.descripcion}</p>}
        <dl className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1 text-xs">
          <Dato etiqueta="Piezas por caja" valor={p.piezasPorCaja} />
          <Dato etiqueta="Caja (L × A × Al)" valor={medidas} />
        </dl>
        {p.memo && <p className="text-[11px] text-zinc-400">{p.memo}</p>}
        {muestraPrecio(vista) && p.precioVenta !== null && (
          <div className="flex items-end justify-between gap-2 border-t border-zinc-100 pt-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-zinc-400">Precio</p>
              <p className="text-lg font-semibold text-zinc-900">{formatoPesos(p.precioVenta)}</p>
            </div>
            {vista.conComision && p.comision !== undefined && (
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-emerald-700">Tu comisión</p>
                <p className="text-sm font-semibold text-emerald-700">{formatoPesos(p.comision)} / pza</p>
              </div>
            )}
          </div>
        )}
        <div className="pt-1">
          <PastillaStock stock={p.stock} vista={vista} />
        </div>
      </div>
    </li>
  );
}

/** Hoja imprimible (Imprimir → Guardar como PDF): un producto por renglón
 * con foto grande y todos sus datos. */
export function HojaCatalogoVendedores({
  productos,
  titulo = "Catálogo de productos",
  subtitulo,
  contacto,
  vista,
}: {
  productos: ProductoVendedores[];
  titulo?: string;
  subtitulo?: string | null;
  /** Línea de contacto del vendedor (modo clientes). */
  contacto?: string | null;
  vista: OpcionesVista;
}) {
  const conPrecio = muestraPrecio(vista);
  const conCantidad = !vista.sinCantidades;
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 print:px-0 print:py-0">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Logo href="#" />
          <h1 className="mt-1 text-xl font-semibold text-zinc-900">{titulo}</h1>
          {subtitulo && <p className="text-sm text-zinc-500">{subtitulo}</p>}
          {contacto && <p className="mt-1 text-sm text-zinc-700">{contacto}</p>}
        </div>
        <div className="text-right text-sm text-zinc-500">
          <p>{formatoFecha(new Date().toISOString())}</p>
          <p className="text-xs">{productos.length} producto(s)</p>
        </div>
      </div>

      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="border-b-2 border-zinc-900 text-zinc-500">
            <th className="w-32 py-2 pr-3 font-medium">Foto</th>
            <th className="py-2 pr-3 font-medium">Producto</th>
            <th className="w-40 py-2 pr-3 font-medium">Empaque</th>
            {conPrecio && <th className="w-24 py-2 pr-3 text-right font-medium">Precio</th>}
            {vista.conComision && <th className="w-24 py-2 pr-3 text-right font-medium">Tu comisión</th>}
            {conCantidad && <th className="w-24 py-2 text-right font-medium">{vista.modo === "vendedor" ? "Disponibles" : "Existencia"}</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200">
          {productos.map((p) => (
            <tr key={p.sku} className="align-top">
              <td className="py-3 pr-3">
                <Foto p={p} clase="h-28 w-28" />
              </td>
              <td className="py-3 pr-3">
                <p className="text-sm font-semibold text-zinc-900">{p.nombre}</p>
                <p className="font-mono text-[11px] text-zinc-500">{p.sku}</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {[p.marca && `Marca: ${p.marca}`, p.categoria && `Categoría: ${p.categoria}`, p.linea && `Línea: ${p.linea}`].filter(Boolean).join(" · ")}
                </p>
                {p.descripcion && <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-zinc-700">{p.descripcion}</p>}
                {p.memo && <p className="mt-1 text-[11px] text-zinc-400">{p.memo}</p>}
              </td>
              <td className="py-3 pr-3 text-zinc-700">
                <p>{p.piezasPorCaja} pza(s) por caja</p>
                {medidasTexto(p) && <p className="text-zinc-500">Caja: {medidasTexto(p)}</p>}
              </td>
              {conPrecio && <td className="py-3 pr-3 text-right text-sm font-semibold tabular-nums text-zinc-900">{p.precioVenta !== null ? formatoPesos(p.precioVenta) : "—"}</td>}
              {vista.conComision && <td className="py-3 pr-3 text-right text-sm tabular-nums text-emerald-700">{p.comision !== undefined ? formatoPesos(p.comision) : "—"}</td>}
              {conCantidad && (
                <td className="py-3 text-right text-sm font-semibold tabular-nums text-zinc-900">
                  {p.stock > 0 ? (vista.modo === "vendedor" ? p.stock.toLocaleString("es-MX") : "Disponible") : <span className="text-zinc-400">Agotado</span>}
                </td>
              )}
            </tr>
          ))}
          {productos.length === 0 && (
            <tr>
              <td colSpan={6} className="py-10 text-center text-sm text-zinc-400">
                Ningún producto con ese filtro.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { costoPromedioPonderado, stockActual } from "@/lib/calculos-stock";
import { formatoPesos, formatoFecha, formatoCajas } from "@/lib/formato";
import { obtenerPerfilActual } from "@/lib/perfil";
import { Logo } from "@/components/logo";
import type { Contenedor, MovimientoStock, Producto } from "@/lib/tipos";
import { EditarProductoGlobal } from "./editar-producto-global";

export default async function DetalleProducto({ params }: { params: Promise<{ sku: string }> }) {
  const { sku: skuCrudo } = await params;
  const sku = decodeURIComponent(skuCrudo);
  const supabase = await createClient();
  const perfil = await obtenerPerfilActual();
  const verDinero = perfil?.rol !== "operadora";

  const [{ data: movimientos }, { data: contenedores }, { data: productoReferencia }] = await Promise.all([
    supabase
      .from("movimientos_stock")
      .select("*")
      .eq("sku", sku)
      .order("creado_en", { ascending: false })
      .returns<MovimientoStock[]>(),
    supabase.from("contenedores").select("*").returns<Contenedor[]>(),
    supabase
      .from("productos")
      .select("*")
      .eq("sku", sku)
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle<Producto>(),
  ]);

  const listaMovimientos = movimientos ?? [];
  if (listaMovimientos.length === 0) notFound();

  const contenedoresPorId = new Map((contenedores ?? []).map((c) => [c.id, c.numero]));
  const masReciente = listaMovimientos[0];
  const actual = stockActual(listaMovimientos);
  const costoProm = costoPromedioPonderado(listaMovimientos);
  // Del producto (la fuente real) primero; si ya no existe el producto
  // (se borró) se recurre al movimiento más reciente como respaldo.
  const piezasPorCaja =
    productoReferencia?.piezas_por_caja ||
    listaMovimientos.find((m) => m.tipo === "ENTRADA" || m.tipo === "AJUSTE")?.piezas_por_caja ||
    1;

  // Si el SKU nunca tuvo una fila en "productos" (ej. se cargó con
  // "Agregar stock manual" o "Carga masiva"), igual se arma algo editable
  // a partir del movimiento más reciente — que no exista en "productos"
  // no debe bloquear el botón de editar.
  const productoParaEditar = productoReferencia ?? {
    sku,
    nombre: masReciente.nombre,
    imagen_url: masReciente.imagen_url,
    categoria: null,
    piezas_por_caja: piezasPorCaja,
    fabrica: null,
    proveedor: null,
  };

  // Entradas agrupadas por contenedor — para responder "¿cuándo y en qué
  // contenedores he pedido esto?" de un vistazo, sin bucear en el libro
  // completo de movimientos.
  const entradasConContenedor = listaMovimientos.filter(
    (m) => (m.tipo === "ENTRADA" || (m.tipo === "AJUSTE" && m.cantidad > 0)) && m.contenedor_id,
  );
  const porContenedor = new Map<string, { cantidad: number; fecha: string; costo: number }>();
  for (const m of entradasConContenedor) {
    const existente = porContenedor.get(m.contenedor_id!);
    if (!existente || m.creado_en > existente.fecha) {
      porContenedor.set(m.contenedor_id!, {
        cantidad: (existente?.cantidad ?? 0) + m.cantidad,
        fecha: m.creado_en,
        costo: m.costo_unitario_pesos,
      });
    } else {
      porContenedor.set(m.contenedor_id!, { ...existente, cantidad: existente.cantidad + m.cantidad });
    }
  }
  const contenedoresOrdenados = Array.from(porContenedor.entries())
    .filter(([id]) => contenedoresPorId.has(id))
    .sort((a, b) => (a[1].fecha < b[1].fecha ? 1 : -1));

  const entradasSinContenedor = listaMovimientos.filter(
    (m) => (m.tipo === "ENTRADA" || (m.tipo === "AJUSTE" && m.cantidad > 0)) && !m.contenedor_id,
  );
  const totalSinContenedor = entradasSinContenedor.reduce((s, m) => s + m.cantidad, 0);

  const totalSalidas = listaMovimientos
    .filter((m) => m.tipo === "SALIDA")
    .reduce((s, m) => s + m.cantidad, 0);

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Logo />
          <Link href="/stock" className="text-sm font-medium text-zinc-500 transition hover:text-zinc-900">
            ← Stock
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          {masReciente.imagen_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- foto grande de encabezado
            <img
              src={masReciente.imagen_url}
              alt={masReciente.nombre}
              className="h-20 w-20 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-xs text-zinc-400">
              Sin foto
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-zinc-900">{masReciente.nombre}</h1>
            <p className="font-mono text-sm text-zinc-400">{sku}</p>
          </div>
          {verDinero && <EditarProductoGlobal sku={sku} producto={productoParaEditar} />}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">Stock actual</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900">{actual}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">Cajas</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900">
              {piezasPorCaja > 0 ? formatoCajas(actual / piezasPorCaja) : "—"}
            </p>
          </div>
          {verDinero && (
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-xs text-zinc-500">Costo prom.</p>
              <p className="mt-1 text-lg font-semibold text-zinc-900">{formatoPesos(costoProm)}</p>
            </div>
          )}
          {verDinero && (
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-xs text-zinc-500">Valor</p>
              <p className="mt-1 text-lg font-semibold text-zinc-900">{formatoPesos(actual * costoProm)}</p>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 p-6">
            <h2 className="text-sm font-semibold text-zinc-900">Pedidos por contenedor</h2>
            <p className="mt-1 text-xs text-zinc-500">En qué contenedores has traído este producto, más reciente primero.</p>
          </div>
          {contenedoresOrdenados.length === 0 && totalSinContenedor === 0 ? (
            <p className="p-6 text-sm text-zinc-500">Todavía no hay entradas registradas.</p>
          ) : (
            <div className="divide-y divide-zinc-100">
              {contenedoresOrdenados.map(([id, info]) => (
                <div key={id} className="flex items-center justify-between px-6 py-3 text-sm">
                  <Link href={`/contenedores/${id}`} className="font-medium text-zinc-900 hover:underline">
                    Contenedor {contenedoresPorId.get(id)}
                  </Link>
                  <div className="text-right">
                    <p className="font-semibold text-zinc-900">+{info.cantidad} pzas</p>
                    <p className="text-xs text-zinc-400">
                      {formatoFecha(info.fecha)}
                      {verDinero && ` · ${formatoPesos(info.costo)}/pza`}
                    </p>
                  </div>
                </div>
              ))}
              {totalSinContenedor > 0 && (
                <div className="flex items-center justify-between px-6 py-3 text-sm">
                  <span className="font-medium text-zinc-500">Carga manual (sin contenedor)</span>
                  <span className="font-semibold text-zinc-900">+{totalSinContenedor} pzas</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 p-6">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Movimientos</h2>
              <p className="mt-1 text-xs text-zinc-500">Total salido: {totalSalidas} pzas</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-xs text-zinc-400">
                  <th className="px-6 py-2.5 font-medium">Fecha</th>
                  <th className="px-6 py-2.5 font-medium">Tipo</th>
                  <th className="px-6 py-2.5 font-medium text-right">Cantidad</th>
                  <th className="px-6 py-2.5 font-medium">Origen / destino</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {listaMovimientos.map((m) => (
                  <tr key={m.id}>
                    <td className="px-6 py-3 text-xs text-zinc-500">{formatoFecha(m.creado_en)}</td>
                    <td className="px-6 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          m.tipo === "ENTRADA"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                            : m.tipo === "SALIDA"
                              ? "bg-sky-50 text-sky-700 ring-sky-600/20"
                              : "bg-violet-50 text-violet-700 ring-violet-600/20"
                        }`}
                      >
                        {m.tipo === "ENTRADA" ? "Entrada" : m.tipo === "SALIDA" ? "Salida" : "Ajuste"}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-zinc-900">
                      {m.tipo === "SALIDA" ? "-" : m.tipo === "AJUSTE" && m.cantidad < 0 ? "" : "+"}
                      {m.cantidad}
                    </td>
                    <td className="px-6 py-3 text-xs text-zinc-500">
                      {m.contenedor_id && contenedoresPorId.has(m.contenedor_id) ? (
                        <Link href={`/contenedores/${m.contenedor_id}`} className="hover:underline">
                          Contenedor {contenedoresPorId.get(m.contenedor_id)}
                        </Link>
                      ) : (
                        [m.destino, m.referencia].filter(Boolean).join(" · ") || "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

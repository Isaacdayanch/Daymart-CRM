"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { costoFinalPorPieza, costoPorCbmContenedor, tipoCambioPromedioMercancia } from "@/lib/calculos";
import { registrarHistorialSiCambia } from "../actions";
import type { Contenedor, PagoMercancia, Producto } from "@/lib/tipos";

export async function confirmarRecepcion(contenedorId: string, formData: FormData) {
  const supabase = await createClient();
  const bodegaId = formData.get("bodega_id") as string;
  if (!bodegaId) return;

  // Por defecto es "ahora", pero Isaac puede poner una fecha pasada al
  // cargar contenedores históricos, para que el inventario quede fechado
  // como realmente llegó.
  const fechaCampo = formData.get("fecha_recepcion");
  const fechaRecepcion =
    typeof fechaCampo === "string" && fechaCampo
      ? new Date(`${fechaCampo}T12:00:00`).toISOString()
      : new Date().toISOString();

  const [{ data: contenedor }, { data: productos }, { data: abonos }] = await Promise.all([
    supabase.from("contenedores").select("*").eq("id", contenedorId).single<Contenedor>(),
    supabase
      .from("productos")
      .select("*")
      .eq("contenedor_id", contenedorId)
      .returns<Producto[]>(),
    supabase.from("pagos_mercancia").select("*").eq("contenedor_id", contenedorId).returns<PagoMercancia[]>(),
  ]);

  if (!contenedor || !productos || contenedor.stock_generado_en) return;

  const pendientesACrear: Record<string, unknown>[] = [];
  const productosRecibidos: Producto[] = [];

  for (const producto of productos) {
    const cantidadRecibida = Number(formData.get(`cantidad_${producto.id}`)) || 0;
    const faltante = producto.cantidad - cantidadRecibida;

    if (faltante > 0) {
      const nota = formData.get(`nota_${producto.id}`);
      pendientesACrear.push({
        contenedor_origen_id: contenedorId,
        sku: producto.sku,
        nombre: producto.nombre,
        categoria: producto.categoria,
        fabrica: producto.fabrica,
        proveedor: producto.proveedor,
        imagen_url: producto.imagen_url,
        memo: producto.memo,
        precio_dolares: producto.precio_dolares,
        piezas_por_caja: producto.piezas_por_caja,
        largo_cm: producto.largo_cm,
        ancho_cm: producto.ancho_cm,
        alto_cm: producto.alto_cm,
        cantidad_pendiente: faltante,
        pagado: formData.get(`pagado_${producto.id}`) === "true",
        notas: typeof nota === "string" && nota.trim() ? nota.trim() : null,
      });
    }

    if (cantidadRecibida !== producto.cantidad) {
      await supabase.from("productos").update({ cantidad: cantidadRecibida }).eq("id", producto.id);
    }
    productosRecibidos.push({ ...producto, cantidad: cantidadRecibida });
  }

  if (pendientesACrear.length) {
    await supabase.from("pendientes_china").insert(pendientesACrear);
  }

  // El costo por CBM se recalcula con las cantidades REALES recibidas, para
  // que el gasto de flete/aduana se reparta sobre lo que de verdad viajó.
  const costoPorCbm = costoPorCbmContenedor(contenedor, productosRecibidos);
  const tipoCambioMercancia = tipoCambioPromedioMercancia(abonos ?? []);

  const movimientos = productosRecibidos
    .filter((p) => p.cantidad > 0)
    .map((p) => ({
      tipo: "ENTRADA",
      sku: p.sku,
      nombre: p.nombre,
      bodega_id: bodegaId,
      cantidad: p.cantidad,
      piezas_por_caja: p.piezas_por_caja,
      imagen_url: p.imagen_url,
      costo_unitario_pesos: costoFinalPorPieza(p, costoPorCbm, tipoCambioMercancia),
      contenedor_id: contenedorId,
      referencia: `Recepción contenedor ${contenedor.numero}`,
      creado_en: fechaRecepcion,
    }));

  if (movimientos.length) {
    await supabase.from("movimientos_stock").insert(movimientos);
  }

  await registrarHistorialSiCambia(supabase, contenedorId, "RECIBIDO_BODEGA", fechaRecepcion);
  await supabase
    .from("contenedores")
    .update({ estado: "RECIBIDO_BODEGA", stock_generado_en: fechaRecepcion })
    .eq("id", contenedorId);

  revalidatePath(`/contenedores/${contenedorId}`);
  revalidatePath("/stock");
  revalidatePath("/stock/pendientes");
  redirect(`/contenedores/${contenedorId}`);
}

/** Corrige una recepción ya confirmada (Isaac hizo un conteo físico y algo
 * no cuadraba). No vuelve a crear ENTRADAs — solo guarda la diferencia como
 * un movimiento de AJUSTE, para no duplicar lo que ya estaba en stock. */
export async function editarRecepcion(contenedorId: string, formData: FormData) {
  const supabase = await createClient();
  const bodegaId = formData.get("bodega_id") as string;
  if (!bodegaId) return;

  const [{ data: contenedor }, { data: productos }, { data: entradasPrevias }] = await Promise.all([
    supabase.from("contenedores").select("*").eq("id", contenedorId).single<Contenedor>(),
    supabase.from("productos").select("*").eq("contenedor_id", contenedorId).returns<Producto[]>(),
    supabase
      .from("movimientos_stock")
      .select("*")
      .eq("contenedor_id", contenedorId)
      .eq("tipo", "ENTRADA")
      .returns<{ sku: string; costo_unitario_pesos: number }[]>(),
  ]);

  if (!contenedor || !productos || !contenedor.stock_generado_en) return;

  const costoPorSku = new Map((entradasPrevias ?? []).map((m) => [m.sku, m.costo_unitario_pesos]));
  const ajustes: Record<string, unknown>[] = [];

  for (const producto of productos) {
    const cantidadNueva = Number(formData.get(`cantidad_${producto.id}`)) || 0;
    const diferencia = cantidadNueva - producto.cantidad;
    if (diferencia === 0) continue;

    ajustes.push({
      tipo: "AJUSTE",
      sku: producto.sku,
      nombre: producto.nombre,
      bodega_id: bodegaId,
      cantidad: diferencia,
      piezas_por_caja: producto.piezas_por_caja,
      imagen_url: producto.imagen_url,
      costo_unitario_pesos: costoPorSku.get(producto.sku) ?? 0,
      contenedor_id: contenedorId,
      referencia: `Corrección de conteo — contenedor ${contenedor.numero}`,
    });

    await supabase.from("productos").update({ cantidad: cantidadNueva }).eq("id", producto.id);
  }

  if (ajustes.length) {
    await supabase.from("movimientos_stock").insert(ajustes);
  }

  revalidatePath(`/contenedores/${contenedorId}`);
  revalidatePath("/stock");
  revalidatePath("/stock/movimientos");
  redirect(`/contenedores/${contenedorId}`);
}

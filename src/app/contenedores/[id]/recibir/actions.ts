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
      costo_unitario_pesos: costoFinalPorPieza(p, costoPorCbm, tipoCambioMercancia),
      contenedor_id: contenedorId,
      referencia: `Recepción contenedor ${contenedor.numero}`,
    }));

  if (movimientos.length) {
    await supabase.from("movimientos_stock").insert(movimientos);
  }

  await registrarHistorialSiCambia(supabase, contenedorId, "RECIBIDO_BODEGA");
  await supabase
    .from("contenedores")
    .update({ estado: "RECIBIDO_BODEGA", stock_generado_en: new Date().toISOString() })
    .eq("id", contenedorId);

  revalidatePath(`/contenedores/${contenedorId}`);
  revalidatePath("/stock");
  revalidatePath("/stock/pendientes");
  redirect(`/contenedores/${contenedorId}`);
}

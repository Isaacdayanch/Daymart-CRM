"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { texto } from "@/lib/form-helpers";
import { obtenerPerfilActual } from "@/lib/perfil";

async function esDueno() {
  const perfil = await obtenerPerfilActual();
  return perfil?.rol === "dueno";
}

function refrescar() {
  revalidatePath("/stock/catalogo");
  revalidatePath("/stock");
  revalidatePath("/contenedores");
}

const CODIGO_VALIDO = /^[A-Z0-9]{2,4}$/;

export async function crearMarca(formData: FormData) {
  if (!(await esDueno())) return { error: "Solo el dueño puede editar marcas." };
  const supabase = await createClient();
  const nombre = texto(formData, "nombre");
  const codigo = (texto(formData, "codigo") ?? "").toUpperCase();
  if (!nombre) return { error: "Falta el nombre de la marca." };
  if (!CODIGO_VALIDO.test(codigo)) return { error: "El código debe ser de 2 a 4 letras o números (ej. MAM)." };
  const { error } = await supabase.from("marcas").insert({ nombre, codigo, notas: texto(formData, "notas") });
  if (error) return { error: /duplicate|unique/i.test(error.message) ? "Ya existe una marca con ese nombre o código." : error.message };
  refrescar();
  return { error: null };
}

export async function actualizarMarca(marcaId: string, formData: FormData) {
  if (!(await esDueno())) return { error: "Solo el dueño puede editar marcas." };
  const supabase = await createClient();
  const nombre = texto(formData, "nombre");
  const codigo = (texto(formData, "codigo") ?? "").toUpperCase();
  if (!nombre) return { error: "Falta el nombre de la marca." };
  if (!CODIGO_VALIDO.test(codigo)) return { error: "El código debe ser de 2 a 4 letras o números (ej. MAM)." };
  const { error } = await supabase.from("marcas").update({ nombre, codigo, notas: texto(formData, "notas") }).eq("id", marcaId);
  if (error) return { error: /duplicate|unique/i.test(error.message) ? "Ya existe una marca con ese nombre o código." : error.message };
  refrescar();
  return { error: null };
}

/** Quitar una marca solo si ningún producto la usa (soft delete). */
export async function eliminarMarca(marcaId: string) {
  if (!(await esDueno())) return { error: "Solo el dueño puede editar marcas." };
  const supabase = await createClient();
  const { count } = await supabase.from("productos_catalogo").select("sku", { count: "exact", head: true }).eq("marca_id", marcaId).is("eliminado_en", null);
  if (count) return { error: `No se puede quitar: ${count} producto(s) tienen esta marca. Cámbiales la marca primero.` };
  const { error } = await supabase.from("marcas").update({ eliminado_en: new Date().toISOString() }).eq("id", marcaId);
  if (error) return { error: error.message };
  refrescar();
  return { error: null };
}

/** Edita la ficha de un producto del catálogo (nombre, marca, línea,
 * categoría). El nombre y la marca también se propagan a los movimientos de
 * stock y a los productos de contenedor con ese SKU, para que todo diga lo
 * mismo. El SKU no se cambia desde aquí. */
export async function actualizarProductoCatalogo(sku: string, formData: FormData) {
  if (!(await esDueno())) return { error: "Solo el dueño puede editar el catálogo." };
  const supabase = await createClient();
  const nombre = texto(formData, "nombre");
  if (!nombre) return { error: "Falta el nombre." };
  const marcaId = texto(formData, "marca_id");
  const linea = texto(formData, "linea");
  const categoria = texto(formData, "categoria");
  const descripcion = texto(formData, "descripcion");
  const cambios = { nombre, marca_id: marcaId, linea, categoria, actualizado_en: new Date().toISOString() };
  let { error } = await supabase
    .from("productos_catalogo")
    .update({ ...cambios, descripcion })
    .eq("sku", sku);
  // Sin el SQL 0043 todavía no existe la columna `descripcion`: se guarda
  // lo demás y se avisa.
  if (error && /descripcion/.test(error.message)) {
    ({ error } = await supabase.from("productos_catalogo").update(cambios).eq("sku", sku));
    if (!error && descripcion) return { error: "Se guardó todo menos la descripción: falta correr el SQL 0044 en Supabase." };
  }
  if (error) return { error: error.message };
  await supabase.from("movimientos_stock").update({ nombre }).eq("sku", sku);
  await supabase.from("productos").update({ nombre, marca_id: marcaId, ...(categoria ? { categoria } : {}) }).eq("sku", sku);
  refrescar();
  revalidatePath("/stock/movimientos");
  return { error: null };
}


/** Quita un producto de Stock por completo (caso real de Isaac: un producto
 * duplicado). A propósito NO es fácil: hay que escribir el SKU exacto.
 *
 * Solo se puede quitar un producto cuyo stock se capturó a mano (altas en
 * Stock, carga masiva, histórico, ajustes, salidas sueltas). Si el SKU está
 * ligado a algo más — un contenedor, una venta, una orden o envío de
 * Mercado Libre, un envío a Full en camino o mercancía pendiente en China —
 * se niega y dice exactamente qué lo detiene, porque esos registros se
 * corrigen desde su origen (mismo principio que `movimientoSuelto`).
 *
 * Qué borra: sus movimientos de stock, sus ligas con publicaciones de ML,
 * sus precios/comisiones de vendedores, y la ficha del catálogo queda con
 * `eliminado_en` (soft delete: si el mismo SKU se vuelve a dar de alta,
 * `guardarEnCatalogo` la revive). */
export async function eliminarProductoStock(sku: string, formData: FormData) {
  if (!(await esDueno())) return { error: "Solo el dueño puede quitar productos." };
  const confirmacion = (texto(formData, "confirmacion") ?? "").toUpperCase();
  if (confirmacion !== sku.trim().toUpperCase()) {
    return { error: `Para quitarlo escribe exactamente el SKU: ${sku}` };
  }
  const supabase = await createClient();

  const [{ data: movimientos }, { data: enContenedores }, { data: pendientes }, { data: lineasFull }] = await Promise.all([
    supabase
      .from("movimientos_stock")
      .select("id, contenedor_id, venta_id, orden_ml_id, envio_full_id, recepcion_full_id, inbound_ml_id")
      .eq("sku", sku)
      .returns<{ id: string; contenedor_id: string | null; venta_id: string | null; orden_ml_id: number | null; envio_full_id: string | null; recepcion_full_id: string | null; inbound_ml_id: string | null }[]>(),
    supabase
      .from("productos")
      .select("contenedor:contenedores(numero, eliminado_en)")
      .eq("sku", sku)
      .returns<{ contenedor: { numero: number; eliminado_en: string | null } | { numero: number; eliminado_en: string | null }[] | null }[]>(),
    supabase.from("pendientes_china").select("id").eq("sku", sku).eq("estado", "PENDIENTE"),
    supabase
      .from("envios_full_lineas")
      .select("id, envio:envios_full(numero, estado)")
      .eq("sku", sku)
      .returns<{ id: string; envio: { numero: number; estado: string } | { numero: number; estado: string }[] | null }[]>(),
  ]);

  const ataduras: string[] = [];
  const numerosContenedor = new Set<number>();
  for (const p of enContenedores ?? []) {
    const c = Array.isArray(p.contenedor) ? p.contenedor[0] : p.contenedor;
    if (c && !c.eliminado_en) numerosContenedor.add(c.numero);
  }
  if (numerosContenedor.size > 0) {
    ataduras.push(`está en el contenedor ${Array.from(numerosContenedor).sort((a, b) => a - b).join(", ")} (quítalo o cámbiale el SKU desde el contenedor)`);
  }
  const movs = movimientos ?? [];
  if (movs.some((m) => m.contenedor_id)) ataduras.push("tiene entradas que vienen de un contenedor recibido");
  if (movs.some((m) => m.venta_id)) ataduras.push("tiene salidas por ventas directas (cancélalas desde Ventas)");
  if (movs.some((m) => m.orden_ml_id || m.envio_full_id || m.recepcion_full_id || m.inbound_ml_id)) {
    ataduras.push("tiene salidas generadas por Mercado Libre (ventas o envíos a Full)");
  }
  const enviosAbiertos = new Set<number>();
  for (const l of lineasFull ?? []) {
    const e = Array.isArray(l.envio) ? l.envio[0] : l.envio;
    if (e && e.estado === "PREPARADO") enviosAbiertos.add(e.numero);
  }
  if (enviosAbiertos.size > 0) ataduras.push(`va en el envío a Full #${Array.from(enviosAbiertos).join(", #")} que sigue en camino`);
  if ((pendientes ?? []).length > 0) ataduras.push("tiene mercancía pendiente en China (Stock → Pendientes)");
  if (ataduras.length > 0) {
    return { error: `No se puede quitar «${sku}»: ${ataduras.join("; ")}. Si es un duplicado, lo que conviene es quitar el otro.` };
  }

  // Todo lo que tiene es capturado a mano: se borra.
  const { error: errorMov } = await supabase.from("movimientos_stock").delete().eq("sku", sku);
  if (errorMov) return { error: `No se pudieron borrar sus movimientos: ${errorMov.message}` };

  // Precios y comisiones de vendedores (si falta el SQL, no detiene el borrado).
  await supabase.from("precios_vendedor").delete().eq("sku", sku);
  await supabase.from("comisiones_vendedor_producto").delete().eq("sku", sku);

  // Ligas con publicaciones de Mercado Libre (tabla sin políticas: solo el
  // servidor con la service role key).
  try {
    const { createServiceClient } = await import("@/lib/supabase/servicio");
    const servicio = createServiceClient();
    await servicio.from("mercadolibre_vinculos").delete().eq("sku_crm", sku);
    await servicio.from("mercadolibre_sku_vinculos").delete().eq("sku_crm", sku);
  } catch {
    // sin service role key (entorno local) — la liga se queda, no estorba
  }

  const { error: errorCat } = await supabase.from("productos_catalogo").update({ eliminado_en: new Date().toISOString() }).eq("sku", sku);
  if (errorCat && !/does not exist|schema cache/i.test(errorCat.message)) return { error: errorCat.message };

  refrescar();
  revalidatePath("/stock/movimientos");
  revalidatePath("/stock/catalogo");
  revalidatePath("/mercadolibre/stock");
  revalidatePath("/vendedores/precios");
  revalidatePath("/");
  return { error: null, movimientosBorrados: movs.length };
}

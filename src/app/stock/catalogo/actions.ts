"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { texto } from "@/lib/form-helpers";
import { obtenerPerfilActual } from "@/lib/perfil";
import { camposFichaDeFormulario, guardarCamposFicha } from "@/lib/ficha-producto";
import { stockActual } from "@/lib/calculos-stock";
import type { MovimientoStock } from "@/lib/tipos";

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
  // Piezas por caja, medidas, peso y precio (Isaac, 16 oct: "¿en dónde
  // corrijo las medidas y el precio?").
  const { avisos } = await guardarCamposFicha(supabase, sku, nombre, camposFichaDeFormulario(formData));
  refrescar();
  revalidatePath("/stock/movimientos");
  revalidatePath(`/stock/producto/${encodeURIComponent(sku)}`);
  revalidatePath("/vendedores/precios");
  return { error: avisos.length ? avisos.join(" ") : null };
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
    return { error: `No se puede quitar «${sku}»: ${ataduras.join("; ")}. Si es un duplicado, usa «fusionar con otro producto»: junta todo su historial en el bueno.` };
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

// ---------------------------------------------------------------------------
// Fusionar dos productos duplicados (Isaac, 16 oct: "los yoga blocks los
// tengo duplicados… ¿me lo puedes corregir?")
// ---------------------------------------------------------------------------

export interface ResumenFusion {
  sku: string;
  nombre: string;
  imagenUrl: string | null;
  enCatalogo: boolean;
  stock: number;
  movimientos: number;
  /** Movimientos marcados como "histórico de antes del sistema". */
  historicos: number;
  ligasMl: number;
  contenedores: number[];
  precioVenta: number | null;
}

async function servicioMl() {
  try {
    const { createServiceClient } = await import("@/lib/supabase/servicio");
    return createServiceClient();
  } catch {
    return null;
  }
}

async function resumenParaFusion(supabase: Awaited<ReturnType<typeof createClient>>, sku: string): Promise<ResumenFusion> {
  const [{ data: ficha }, { data: movs }, { data: enContenedores }] = await Promise.all([
    supabase.from("productos_catalogo").select("sku, nombre, imagen_url, precio_venta").eq("sku", sku).is("eliminado_en", null).maybeSingle<{ sku: string; nombre: string; imagen_url: string | null; precio_venta: number | null }>(),
    supabase.from("movimientos_stock").select("*").eq("sku", sku).returns<MovimientoStock[]>(),
    supabase
      .from("productos")
      .select("contenedor:contenedores(numero, eliminado_en)")
      .eq("sku", sku)
      .returns<{ contenedor: { numero: number; eliminado_en: string | null } | { numero: number; eliminado_en: string | null }[] | null }[]>(),
  ]);
  const movimientos = movs ?? [];
  const numeros = new Set<number>();
  for (const r of enContenedores ?? []) {
    const c = Array.isArray(r.contenedor) ? r.contenedor[0] : r.contenedor;
    if (c && !c.eliminado_en) numeros.add(c.numero);
  }
  let ligasMl = 0;
  const servicio = await servicioMl();
  if (servicio) {
    const [{ count: a }, { count: b }] = await Promise.all([
      servicio.from("mercadolibre_vinculos").select("item_id", { count: "exact", head: true }).eq("sku_crm", sku),
      servicio.from("mercadolibre_sku_vinculos").select("seller_sku", { count: "exact", head: true }).eq("sku_crm", sku),
    ]);
    ligasMl = (a ?? 0) + (b ?? 0);
  }
  const reciente = [...movimientos].sort((x, y) => (x.creado_en < y.creado_en ? 1 : -1))[0];
  return {
    sku,
    nombre: ficha?.nombre ?? reciente?.nombre ?? sku,
    imagenUrl: ficha?.imagen_url ?? reciente?.imagen_url ?? null,
    enCatalogo: Boolean(ficha),
    stock: stockActual(movimientos),
    movimientos: movimientos.length,
    historicos: movimientos.filter((m) => m.historico).length,
    ligasMl,
    contenedores: Array.from(numeros).sort((x, y) => x - y),
    precioVenta: ficha?.precio_venta ?? null,
  };
}

/** Qué pasaría si se fusiona `skuQuitar` dentro de `skuConservar`. No guarda nada. */
export async function previsualizarFusion(skuQuitar: string, skuConservar: string) {
  if (!(await esDueno())) return { error: "Solo el dueño puede fusionar productos." };
  if (!skuQuitar || !skuConservar) return { error: "Elige con qué producto se va a fusionar." };
  if (skuQuitar.trim().toUpperCase() === skuConservar.trim().toUpperCase()) return { error: "Son el mismo producto: elige otro." };
  const supabase = await createClient();
  const [quitar, conservar] = await Promise.all([resumenParaFusion(supabase, skuQuitar), resumenParaFusion(supabase, skuConservar)]);
  if (quitar.movimientos === 0 && !quitar.enCatalogo) return { error: `No encontré el producto «${skuQuitar}».` };
  if (conservar.movimientos === 0 && !conservar.enCatalogo) return { error: `No encontré el producto «${skuConservar}».` };
  // Regla del histórico: una sola "foto de antes del sistema" por producto.
  // Si los dos tienen, se queda el del que se conserva y el otro se descarta.
  const historicoSeDescarta = quitar.historicos > 0 && conservar.historicos > 0;
  return { error: null, quitar, conservar, historicoSeDescarta };
}

/** Junta TODO lo de `skuQuitar` (movimientos de stock, ligas con Mercado
 * Libre, precios/comisiones de vendedores, productos de contenedores,
 * pendientes de China, líneas de ventas y de envíos a Full) en
 * `skuConservar`, completa la ficha del bueno con lo que le falte (foto,
 * medidas, precio…) y deja la ficha del duplicado como eliminada. No borra
 * historial: lo MUEVE. Única excepción: si los dos tienen "histórico de antes
 * del sistema", el del duplicado se descarta (si no, el stock saldría doble).
 * Se confirma escribiendo el SKU que se va a quitar. */
export async function fusionarProductos(skuQuitar: string, skuConservar: string, formData: FormData) {
  if (!(await esDueno())) return { error: "Solo el dueño puede fusionar productos." };
  const confirmacion = (texto(formData, "confirmacion") ?? "").toUpperCase();
  if (confirmacion !== skuQuitar.trim().toUpperCase()) return { error: `Para fusionar escribe exactamente el SKU que se quita: ${skuQuitar}` };
  const previa = await previsualizarFusion(skuQuitar, skuConservar);
  if (previa.error || !previa.quitar || !previa.conservar) return { error: previa.error ?? "No se pudo revisar la fusión." };
  const supabase = await createClient();
  const hechos: string[] = [];

  // 1) Movimientos de stock: el histórico duplicado se descarta, el resto se mueve.
  if (previa.historicoSeDescarta) {
    const { error, count } = await supabase.from("movimientos_stock").delete({ count: "exact" }).eq("sku", skuQuitar).eq("historico", true);
    if (error) return { error: `No se pudo descartar el histórico duplicado: ${error.message}` };
    hechos.push(`se descartó el histórico de «${skuQuitar}» (${count ?? 0} renglones) porque «${skuConservar}» ya tenía el suyo`);
  }
  {
    const { error, count } = await supabase
      .from("movimientos_stock")
      .update({ sku: skuConservar, nombre: previa.conservar.nombre }, { count: "exact" })
      .eq("sku", skuQuitar);
    if (error) return { error: `No se pudieron mover los movimientos de stock: ${error.message}` };
    hechos.push(`${count ?? 0} movimiento(s) de stock pasaron a «${skuConservar}»`);
  }

  // 2) Productos de contenedores, pendientes de China, ventas, envíos a Full.
  const { error: errorProductos, count: productosMovidos } = await supabase.from("productos").update({ sku: skuConservar }, { count: "exact" }).eq("sku", skuQuitar);
  if (errorProductos) return { error: `Se movió el stock, pero no los productos de contenedores: ${errorProductos.message}` };
  if (productosMovidos) hechos.push(`${productosMovidos} producto(s) de contenedor ahora llevan el SKU «${skuConservar}»`);
  await supabase.from("pendientes_china").update({ sku: skuConservar }).eq("sku", skuQuitar);
  await supabase.from("venta_lineas").update({ sku: skuConservar }).eq("sku", skuQuitar);
  await supabase.from("envios_full_lineas").update({ sku: skuConservar }).eq("sku", skuQuitar);

  // 3) Precios y comisiones de vendedores: si el bueno ya tiene el renglón
  //    de ese vendedor, gana el bueno y el del duplicado se borra.
  for (const tabla of ["precios_vendedor", "comisiones_vendedor_producto"] as const) {
    const { data: filas } = await supabase.from(tabla).select("vendedor_id").eq("sku", skuQuitar).returns<{ vendedor_id: string }[]>();
    for (const f of filas ?? []) {
      const { count } = await supabase.from(tabla).select("sku", { count: "exact", head: true }).eq("sku", skuConservar).eq("vendedor_id", f.vendedor_id);
      if (count) await supabase.from(tabla).delete().eq("sku", skuQuitar).eq("vendedor_id", f.vendedor_id);
      else await supabase.from(tabla).update({ sku: skuConservar }).eq("sku", skuQuitar).eq("vendedor_id", f.vendedor_id);
    }
  }

  // 4) Ligas con Mercado Libre (tablas sin políticas: service role).
  const servicio = await servicioMl();
  if (servicio) {
    const { count: a } = await servicio.from("mercadolibre_vinculos").update({ sku_crm: skuConservar }, { count: "exact" }).eq("sku_crm", skuQuitar);
    const { count: b } = await servicio.from("mercadolibre_sku_vinculos").update({ sku_crm: skuConservar }, { count: "exact" }).eq("sku_crm", skuQuitar);
    await servicio.from("mercadolibre_full_recepciones").update({ sku_crm: skuConservar }).eq("sku_crm", skuQuitar);
    const ligas = (a ?? 0) + (b ?? 0);
    if (ligas) hechos.push(`${ligas} liga(s) con Mercado Libre ahora apuntan a «${skuConservar}»`);
  } else if (previa.quitar.ligasMl > 0) {
    hechos.push("las ligas con Mercado Libre no se pudieron mover desde aquí (vuelve a ligarlas en Ligar SKUs)");
  }

  // 5) Ficha del catálogo: el bueno se completa con lo que le falte y el
  //    duplicado queda eliminado (soft delete).
  const { data: fichas } = await supabase.from("productos_catalogo").select("*").in("sku", [skuQuitar, skuConservar]);
  const fichaQuitar = (fichas ?? []).find((f: { sku: string }) => f.sku === skuQuitar) as Record<string, unknown> | undefined;
  const fichaConservar = (fichas ?? []).find((f: { sku: string }) => f.sku === skuConservar) as Record<string, unknown> | undefined;
  if (fichaQuitar) {
    if (fichaConservar) {
      const completar: Record<string, unknown> = {};
      for (const campo of ["imagen_url", "marca_id", "linea", "categoria", "memo", "descripcion", "precio_venta", "peso_kg"]) {
        const actual = fichaConservar[campo];
        const otro = fichaQuitar[campo];
        if ((actual === null || actual === undefined || actual === "") && otro !== null && otro !== undefined && otro !== "") completar[campo] = otro;
      }
      for (const campo of ["largo_cm", "ancho_cm", "alto_cm"]) {
        if (!Number(fichaConservar[campo]) && Number(fichaQuitar[campo])) completar[campo] = fichaQuitar[campo];
      }
      if ((Number(fichaConservar.piezas_por_caja) || 1) === 1 && Number(fichaQuitar.piezas_por_caja) > 1) completar.piezas_por_caja = fichaQuitar.piezas_por_caja;
      if (Object.keys(completar).length > 0) {
        await supabase.from("productos_catalogo").update({ ...completar, actualizado_en: new Date().toISOString() }).eq("sku", skuConservar);
        hechos.push(`la ficha de «${skuConservar}» se completó con: ${Object.keys(completar).join(", ")}`);
      }
    } else {
      // El bueno no tenía ficha: la del duplicado pasa a ser la suya.
      const { error } = await supabase.from("productos_catalogo").update({ sku: skuConservar, actualizado_en: new Date().toISOString() }).eq("sku", skuQuitar);
      if (!error) hechos.push(`la ficha del catálogo ahora es de «${skuConservar}»`);
    }
    if (fichaConservar) {
      const { error } = await supabase.from("productos_catalogo").update({ eliminado_en: new Date().toISOString() }).eq("sku", skuQuitar);
      if (error) return { error: `Todo se movió, pero la ficha de «${skuQuitar}» no se pudo quitar: ${error.message}` };
    }
  }

  refrescar();
  revalidatePath("/stock/movimientos");
  revalidatePath("/stock/full");
  revalidatePath("/mercadolibre/stock");
  revalidatePath("/mercadolibre/skus");
  revalidatePath("/vendedores/precios");
  revalidatePath(`/stock/producto/${encodeURIComponent(skuConservar)}`);
  revalidatePath("/");
  return { error: null, hechos, skuConservar };
}

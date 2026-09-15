"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  costoFinalPorPieza,
  costoPorCbmContenedor,
  skuSugerido,
  tipoCambioPromedioMercancia,
} from "@/lib/calculos";
import { nombreArchivoSeguro, numero, texto } from "@/lib/form-helpers";
import { completarColumnasOmitidas, insertarMovimientosStock } from "@/lib/movimientos-stock";
import { valorPendienteChinaPagado } from "@/lib/calculos-pendientes";
import { formatoPesos } from "@/lib/formato";
import {
  ESTADOS_CONTENEDOR,
  type Contenedor,
  type EstadoContenedor,
  type PagoMercancia,
  type PendienteChina,
  type Producto,
  type TipoDocumento,
} from "@/lib/tipos";

const ORDEN_ESTADOS = ESTADOS_CONTENEDOR.map((e) => e.valor);

/** Si el estado cambió, guarda el momento en el historial del contenedor.
 * Por defecto usa la fecha/hora actual, pero se puede pasar una fecha
 * explícita (ej. al recibir un contenedor histórico con fecha pasada).
 *
 * Si el contenedor REGRESA a un estado anterior (Isaac se equivocó, ej.
 * marcó "En tránsito" y lo devolvió a "Configurándose"), las fechas de los
 * estados posteriores se borran — no eran reales — y si se regresa antes
 * de "En tránsito" también se deshace el crédito del proveedor (fecha
 * límite y cargo en Finanzas), porque los días todavía no corren. Si
 * avanza a un estado que ya tenía una fecha vieja de un intento anterior,
 * esa fecha se reemplaza por la nueva. */
export async function registrarHistorialSiCambia(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contenedorId: string,
  estadoNuevo: EstadoContenedor,
  fecha?: string,
) {
  const { data: actual } = await supabase
    .from("contenedores")
    .select("estado")
    .eq("id", contenedorId)
    .single<{ estado: EstadoContenedor }>();

  const idxNuevo = ORDEN_ESTADOS.indexOf(estadoNuevo);
  const idxActual = actual ? ORDEN_ESTADOS.indexOf(actual.estado) : -1;
  const posteriores = ORDEN_ESTADOS.slice(idxNuevo + 1);

  if (actual?.estado === estadoNuevo) {
    // Sin cambio de estado: solo limpia fechas "del futuro" que hayan quedado
    // de un intento anterior (ej. un "En tránsito" que se regresó).
    if (posteriores.length) {
      await supabase
        .from("historial_estados_contenedor")
        .delete()
        .eq("contenedor_id", contenedorId)
        .in("estado", posteriores);
    }
    return;
  }

  if (idxNuevo < idxActual) {
    await supabase
      .from("historial_estados_contenedor")
      .delete()
      .eq("contenedor_id", contenedorId)
      .in("estado", posteriores);
    // Se conserva la fecha original del estado al que se regresa, si la tenía.
    const { count } = await supabase
      .from("historial_estados_contenedor")
      .select("id", { count: "exact", head: true })
      .eq("contenedor_id", contenedorId)
      .eq("estado", estadoNuevo);
    if (!count) {
      await supabase
        .from("historial_estados_contenedor")
        .insert({ contenedor_id: contenedorId, estado: estadoNuevo, ...(fecha ? { fecha } : {}) });
    }
    if (idxNuevo < ORDEN_ESTADOS.indexOf("EN_TRANSITO")) {
      await revertirCreditoProveedor(supabase, contenedorId);
    }
    return;
  }

  await supabase
    .from("historial_estados_contenedor")
    .delete()
    .eq("contenedor_id", contenedorId)
    .in("estado", [estadoNuevo, ...posteriores]);
  await supabase
    .from("historial_estados_contenedor")
    .insert({ contenedor_id: contenedorId, estado: estadoNuevo, ...(fecha ? { fecha } : {}) });
}

/** Deshace lo que aplicarCreditoProveedor generó: quita la fecha límite de
 * los abonos pendientes y borra sus cargos en Finanzas → Proveedores. Se
 * usa cuando el contenedor se regresa a antes de "En tránsito". */
async function revertirCreditoProveedor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contenedorId: string,
) {
  const { data: pendientes } = await supabase
    .from("pagos_mercancia")
    .select("id, cargo_deuda_id")
    .eq("contenedor_id", contenedorId)
    .eq("pagado", false)
    .returns<{ id: string; cargo_deuda_id: string | null }[]>();

  for (const abono of pendientes ?? []) {
    if (abono.cargo_deuda_id) {
      await supabase.from("movimientos_deuda_proveedor").delete().eq("id", abono.cargo_deuda_id);
    }
    await supabase
      .from("pagos_mercancia")
      .update({ fecha_limite: null, cargo_deuda_id: null })
      .eq("id", abono.id);
  }
  revalidatePath("/finanzas/proveedores");
  revalidatePath("/finanzas");
}

/** Crédito del proveedor: a cada abono que siga "Pendiente" le pone su
 * fecha límite (fecha de salida de China + credito_dias) y le genera (o
 * actualiza) su cargo en Finanzas → Proveedores, para que la deuda se vea
 * en "Debes" y en el aviso de vencimiento. Si no se pasa la fecha de
 * salida, se toma del historial ("En tránsito"); si el contenedor todavía
 * no ha salido o no tiene crédito, no hace nada. El cargo queda ligado
 * desde el abono (cargo_deuda_id): un solo dato, nunca dos sueltos. */
export async function aplicarCreditoProveedor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contenedorId: string,
  fechaSalida?: string,
) {
  const { data: contenedor } = await supabase
    .from("contenedores")
    .select("numero, credito_dias, fabrica_principal, proveedor_principal")
    .eq("id", contenedorId)
    .maybeSingle<Pick<Contenedor, "numero" | "credito_dias" | "fabrica_principal" | "proveedor_principal">>();
  if (!contenedor?.credito_dias || contenedor.credito_dias <= 0) return;

  let salida = fechaSalida;
  if (!salida) {
    const { data: transito } = await supabase
      .from("historial_estados_contenedor")
      .select("fecha")
      .eq("contenedor_id", contenedorId)
      .eq("estado", "EN_TRANSITO")
      .order("fecha", { ascending: true })
      .limit(1)
      .maybeSingle<{ fecha: string }>();
    salida = transito?.fecha;
  }
  if (!salida) return;

  const limite = new Date(salida);
  limite.setDate(limite.getDate() + contenedor.credito_dias);
  const fechaLimite = limite.toISOString();

  const proveedor = contenedor.fabrica_principal ?? contenedor.proveedor_principal ?? `Contenedor ${contenedor.numero}`;

  const { data: pendientes } = await supabase
    .from("pagos_mercancia")
    .select("*")
    .eq("contenedor_id", contenedorId)
    .eq("pagado", false)
    .returns<PagoMercancia[]>();

  for (const abono of pendientes ?? []) {
    if (abono.cargo_deuda_id) {
      await supabase
        .from("movimientos_deuda_proveedor")
        .update({ monto: abono.monto_dolares, fecha_limite: fechaLimite })
        .eq("id", abono.cargo_deuda_id);
      await supabase.from("pagos_mercancia").update({ fecha_limite: fechaLimite }).eq("id", abono.id);
      continue;
    }
    const { data: cargo } = await supabase
      .from("movimientos_deuda_proveedor")
      .insert({
        proveedor,
        tipo: "CARGO",
        monto: abono.monto_dolares,
        moneda: "USD",
        fecha: salida,
        fecha_limite: fechaLimite,
        notas: `Crédito del contenedor ${contenedor.numero}`,
        contenedor_id: contenedorId,
      })
      .select("id")
      .single();
    await supabase
      .from("pagos_mercancia")
      .update({ fecha_limite: fechaLimite, cargo_deuda_id: cargo?.id ?? null })
      .eq("id", abono.id);
  }

  revalidatePath("/finanzas/proveedores");
  revalidatePath("/finanzas");
}

/** El costo por pieza que entra a stock se calcula con el flete/aduana/
 * abonos que haya AL MOMENTO de recibir el contenedor. Si Isaac llena esos
 * gastos después (algo muy normal: la mercancía llega antes de que se
 * terminen de pagar/capturar), el costo que ya quedó guardado en las
 * entradas de stock se queda desactualizado — esto lo vuelve a calcular
 * con los datos actuales, sin duplicar ni mover cantidades. */
export async function recalcularCostoEntradasContenedor(
  contenedorId: string,
): Promise<{
  actualizados: number;
  total: number;
  error: string | null;
  regenerado?: boolean;
  creados?: number;
}> {
  // Nunca debe tronar hacia el cliente (eso es lo que muestra la pantalla
  // genérica de error de la aplicación con "Intentar nuevamente") — cualquier
  // problema se regresa como texto para mostrarlo en la propia página.
  try {
    const supabase = await createClient();

    const [{ data: contenedor }, { data: productos }, { data: abonos }] = await Promise.all([
      supabase.from("contenedores").select("*").eq("id", contenedorId).single<Contenedor>(),
      supabase.from("productos").select("*").eq("contenedor_id", contenedorId).returns<Producto[]>(),
      supabase.from("pagos_mercancia").select("*").eq("contenedor_id", contenedorId).returns<PagoMercancia[]>(),
    ]);

    if (!contenedor) return { actualizados: 0, total: 0, error: "No se encontró el contenedor." };
    if (!contenedor.stock_generado_en) {
      return { actualizados: 0, total: 0, error: "Este contenedor todavía no se ha recibido a stock." };
    }
    if (!productos || productos.length === 0) {
      return { actualizados: 0, total: 0, error: null };
    }

    const costoPorCbm = costoPorCbmContenedor(contenedor, productos);
    const tipoCambioMercancia = tipoCambioPromedioMercancia(abonos ?? []);

    // Si el contenedor está "Recibido" pero no tiene NINGUNA entrada de
    // stock guardada, es que la recepción falló al guardar en su momento
    // (bug ya corregido, pero esto repara lo que quedó a medias). Se
    // generan las entradas de cero con lo que hay capturado ahora mismo.
    const { data: entradasExistentes, error: errorConteo } = await supabase
      .from("movimientos_stock")
      .select("id, bodega_id")
      .eq("contenedor_id", contenedorId)
      .eq("tipo", "ENTRADA");

    if (errorConteo) {
      return { actualizados: 0, total: productos.length, error: `Error de base de datos: ${errorConteo.message}` };
    }

    if (!entradasExistentes || entradasExistentes.length === 0) {
      const { data: bodegas } = await supabase
        .from("bodegas")
        .select("*")
        .is("eliminado_en", null)
        .order("creado_en", { ascending: true })
        .limit(1);
      const bodega = bodegas?.[0];
      if (!bodega) {
        return {
          actualizados: 0,
          total: productos.length,
          error: "No hay ninguna bodega creada todavía — ve a Stock → Bodegas, agrega una y vuelve a intentar.",
        };
      }

      const nuevos = productos
        .filter((p) => p.cantidad > 0)
        .map((p) => ({
          tipo: "ENTRADA",
          sku: p.sku,
          nombre: p.nombre,
          bodega_id: bodega.id,
          cantidad: p.cantidad,
          piezas_por_caja: p.piezas_por_caja,
          imagen_url: p.imagen_url,
          costo_unitario_pesos: costoFinalPorPieza(p, costoPorCbm, tipoCambioMercancia),
          contenedor_id: contenedorId,
          producto_id: p.id,
          referencia: `Recepción contenedor ${contenedor.numero} (regenerado)`,
          creado_en: contenedor.stock_generado_en,
        }));

      const { data: insertados, error: errorInsert, columnasOmitidas } = await insertarMovimientosStock(
        supabase,
        nuevos,
      );

      if (errorInsert) {
        return { actualizados: 0, total: productos.length, error: `No se pudo generar el stock: ${errorInsert}` };
      }

      if (insertados && columnasOmitidas.length) {
        await completarColumnasOmitidas(supabase, insertados.map((i) => i.id), nuevos, columnasOmitidas);
      }

      revalidatePath(`/contenedores/${contenedorId}`);
      revalidatePath("/stock");
      revalidatePath("/stock/movimientos");
      return {
        actualizados: insertados?.length ?? 0,
        total: productos.length,
        error: null,
        regenerado: true,
      };
    }

    let actualizados = 0;
    const sinMovimiento: Producto[] = [];
    for (const p of productos) {
      const costo = costoFinalPorPieza(p, costoPorCbm, tipoCambioMercancia);

      // Primero por producto_id (confiable). Si el movimiento es viejo y no
      // tiene producto_id guardado, se busca por SKU como respaldo — así no
      // se queda en $0 en silencio si el producto le cambiaste el SKU después.
      const porId = await supabase
        .from("movimientos_stock")
        .update({ costo_unitario_pesos: costo })
        .eq("contenedor_id", contenedorId)
        .eq("tipo", "ENTRADA")
        .eq("producto_id", p.id)
        .select("id");

      if (porId.error) {
        return { actualizados, total: productos.length, error: `Error de base de datos: ${porId.error.message}` };
      }

      if (porId.data.length > 0) {
        actualizados += porId.data.length;
        continue;
      }

      const porSku = await supabase
        .from("movimientos_stock")
        .update({ costo_unitario_pesos: costo, producto_id: p.id })
        .eq("contenedor_id", contenedorId)
        .eq("tipo", "ENTRADA")
        .is("producto_id", null)
        .eq("sku", p.sku)
        .select("id");

      if (porSku.error) {
        return { actualizados, total: productos.length, error: `Error de base de datos: ${porSku.error.message}` };
      }

      if (porSku.data.length > 0) {
        actualizados += porSku.data.length;
        continue;
      }

      // Ni por producto_id ni por SKU hay un movimiento que actualizar — es
      // un producto que se agregó al contenedor DESPUÉS de recibirlo (o
      // después de la última vez que se recalculó), y por eso nunca entró a
      // stock. Se crea de cero, no se deja pasar en silencio.
      if (p.cantidad > 0) sinMovimiento.push(p);
    }

    let creados = 0;
    if (sinMovimiento.length > 0) {
      const bodegaId =
        entradasExistentes?.[0]?.bodega_id ??
        (
          await supabase
            .from("bodegas")
            .select("id")
            .is("eliminado_en", null)
            .order("creado_en", { ascending: true })
            .limit(1)
        ).data?.[0]?.id;

      if (!bodegaId) {
        return {
          actualizados,
          total: productos.length,
          error: "No hay ninguna bodega creada todavía — ve a Stock → Bodegas, agrega una y vuelve a intentar.",
        };
      }

      const nuevos = sinMovimiento.map((p) => ({
        tipo: "ENTRADA",
        sku: p.sku,
        nombre: p.nombre,
        bodega_id: bodegaId,
        cantidad: p.cantidad,
        piezas_por_caja: p.piezas_por_caja,
        imagen_url: p.imagen_url,
        costo_unitario_pesos: costoFinalPorPieza(p, costoPorCbm, tipoCambioMercancia),
        contenedor_id: contenedorId,
        producto_id: p.id,
        referencia: `Recepción contenedor ${contenedor.numero} (agregado después)`,
        creado_en: contenedor.stock_generado_en,
      }));

      const { data: insertados, error: errorInsert, columnasOmitidas } = await insertarMovimientosStock(
        supabase,
        nuevos,
      );
      if (errorInsert) {
        return { actualizados, total: productos.length, error: `No se pudo generar el stock faltante: ${errorInsert}` };
      }
      if (insertados && columnasOmitidas.length) {
        await completarColumnasOmitidas(supabase, insertados.map((i) => i.id), nuevos, columnasOmitidas);
      }
      creados = insertados?.length ?? 0;
    }

    revalidatePath(`/contenedores/${contenedorId}`);
    revalidatePath("/stock");
    revalidatePath("/stock/movimientos");
    return { actualizados: actualizados + creados, total: productos.length, error: null, creados };
  } catch (e) {
    return { actualizados: 0, total: 0, error: e instanceof Error ? e.message : "Error desconocido." };
  }
}

export async function actualizarContenedor(contenedorId: string, formData: FormData) {
  const supabase = await createClient();
  const estado = formData.get("estado") as EstadoContenedor;

  await registrarHistorialSiCambia(supabase, contenedorId, estado);

  await supabase
    .from("contenedores")
    .update({
      booking: texto(formData, "booking"),
      estado,
      flete_dolares: numero(formData, "flete_dolares"),
      flete_tipo_cambio: numero(formData, "flete_tipo_cambio"),
      aduana_pesos: numero(formData, "aduana_pesos"),
      otros_gastos_dolares: numero(formData, "otros_gastos_dolares"),
      otros_gastos_tipo_cambio: numero(formData, "otros_gastos_tipo_cambio"),
      fabrica_principal: texto(formData, "fabrica_principal"),
      proveedor_principal: texto(formData, "proveedor_principal"),
      credito_dias: numero(formData, "credito_dias") || null,
      flete_estimado: formData.get("flete_estimado") === "true",
      aduana_estimada: formData.get("aduana_estimada") === "true",
      otros_gastos_estimado: formData.get("otros_gastos_estimado") === "true",
    })
    .eq("id", contenedorId);

  await aplicarCreditoProveedor(supabase, contenedorId);
  await recalcularCostoEntradasContenedor(contenedorId);
  revalidatePath(`/contenedores/${contenedorId}`);
}

/** fechaSalida (YYYY-MM-DD) solo aplica al pasar a "En tránsito" — es el
 * día en que el contenedor salió de China, de ahí corren los días de
 * crédito del proveedor. */
export async function cambiarEstado(contenedorId: string, estado: EstadoContenedor, fechaSalida?: string) {
  const supabase = await createClient();
  const fecha =
    estado === "EN_TRANSITO" && fechaSalida ? new Date(`${fechaSalida}T12:00:00`).toISOString() : undefined;
  await registrarHistorialSiCambia(supabase, contenedorId, estado, fecha);
  await supabase.from("contenedores").update({ estado }).eq("id", contenedorId);
  if (estado === "EN_TRANSITO") await aplicarCreditoProveedor(supabase, contenedorId, fecha);
  revalidatePath(`/contenedores/${contenedorId}`);
  revalidatePath("/contenedores");
  revalidatePath("/");
}

/** Manda el contenedor a la papelera (no se borra de verdad, se puede restaurar). */
export async function eliminarContenedor(contenedorId: string) {
  const supabase = await createClient();
  await supabase
    .from("contenedores")
    .update({ eliminado_en: new Date().toISOString() })
    .eq("id", contenedorId);
  redirect("/contenedores");
}

export async function agregarAbono(contenedorId: string, formData: FormData) {
  const supabase = await createClient();

  const fecha = texto(formData, "fecha");

  await supabase.from("pagos_mercancia").insert({
    contenedor_id: contenedorId,
    monto_dolares: numero(formData, "monto_dolares"),
    tipo_cambio: numero(formData, "tipo_cambio"),
    pagado: formData.get("pagado") === "true",
    fecha: fecha ? new Date(`${fecha}T12:00:00`).toISOString() : new Date().toISOString(),
  });

  // Si el contenedor ya salió de China y tiene crédito, el abono pendiente
  // nuevo recibe su fecha límite y su cargo en Finanzas de inmediato.
  await aplicarCreditoProveedor(supabase, contenedorId);
  await recalcularCostoEntradasContenedor(contenedorId);
  revalidatePath(`/contenedores/${contenedorId}`);
}

/** Corrige un abono ya guardado (monto, tipo de cambio estimado o real,
 * fecha, fecha límite). Si tiene cargo ligado en Finanzas, el cargo se
 * actualiza en la misma operación. "Pagado" solo se puede cambiar aquí
 * cuando el abono NO tiene cargo — con cargo, se paga desde Finanzas
 * (cuenta puente) para que el dinero real y la deuda queden en un solo
 * registro. */
export async function actualizarAbono(contenedorId: string, abonoId: string, formData: FormData) {
  const supabase = await createClient();

  const { data: abono } = await supabase
    .from("pagos_mercancia")
    .select("*")
    .eq("id", abonoId)
    .maybeSingle<PagoMercancia>();
  if (!abono) return { error: "No se encontró el abono." };

  const montoDolares = numero(formData, "monto_dolares");
  const tipoCambio = numero(formData, "tipo_cambio");
  if (montoDolares <= 0) return { error: "El monto no es válido." };
  if (tipoCambio <= 0) return { error: "El tipo de cambio no es válido." };

  const fecha = texto(formData, "fecha");
  const fechaLimite = texto(formData, "fecha_limite");
  const pagadoCampo = formData.get("pagado");
  const pagado = abono.cargo_deuda_id ? abono.pagado : pagadoCampo === null ? abono.pagado : pagadoCampo === "true";

  const { error } = await supabase
    .from("pagos_mercancia")
    .update({
      monto_dolares: montoDolares,
      tipo_cambio: tipoCambio,
      pagado,
      fecha: fecha ? new Date(`${fecha}T12:00:00`).toISOString() : abono.fecha,
      fecha_limite: fechaLimite ? new Date(`${fechaLimite}T12:00:00`).toISOString() : abono.fecha_limite,
    })
    .eq("id", abonoId);
  if (error) return { error: error.message };

  if (abono.cargo_deuda_id) {
    const { error: errorCargo } = await supabase
      .from("movimientos_deuda_proveedor")
      .update({
        monto: montoDolares,
        fecha_limite: fechaLimite ? new Date(`${fechaLimite}T12:00:00`).toISOString() : abono.fecha_limite,
      })
      .eq("id", abono.cargo_deuda_id);
    if (errorCargo) return { error: errorCargo.message };
  }

  await recalcularCostoEntradasContenedor(contenedorId);
  revalidatePath(`/contenedores/${contenedorId}`);
  revalidatePath("/finanzas/proveedores");
  revalidatePath("/finanzas");
  return { error: null };
}

/** Si el abono se generó desde una cuenta puente de Finanzas
 * (registrarEnvioCuentaPuente), también borra su movimiento de Finanzas y
 * su abono a la deuda del proveedor ligado — nunca se queda un registro
 * suelto que "debería" coincidir con otro. */
export async function eliminarAbono(contenedorId: string, abonoId: string) {
  const supabase = await createClient();

  const { data: abono } = await supabase
    .from("pagos_mercancia")
    .select("movimiento_financiero_id, cargo_deuda_id")
    .eq("id", abonoId)
    .maybeSingle<{ movimiento_financiero_id: string | null; cargo_deuda_id: string | null }>();

  if (abono?.movimiento_financiero_id) {
    await supabase.from("movimientos_deuda_proveedor").delete().eq("movimiento_financiero_id", abono.movimiento_financiero_id);
    await supabase.from("movimientos_financieros").delete().eq("id", abono.movimiento_financiero_id);
  }
  // El cargo de crédito que este abono pendiente generó en Proveedores se
  // va con él — si no, quedaría una deuda fantasma.
  if (abono?.cargo_deuda_id) {
    await supabase.from("movimientos_deuda_proveedor").delete().eq("id", abono.cargo_deuda_id);
  }

  await supabase.from("pagos_mercancia").delete().eq("id", abonoId);
  await recalcularCostoEntradasContenedor(contenedorId);
  revalidatePath(`/contenedores/${contenedorId}`);
  revalidatePath("/finanzas/proveedores");
  revalidatePath("/finanzas");
  revalidatePath("/finanzas/movimientos");
}

export async function actualizarFechaAbono(contenedorId: string, abonoId: string, formData: FormData) {
  const supabase = await createClient();
  const fecha = texto(formData, "fecha");
  if (!fecha) return;

  await supabase
    .from("pagos_mercancia")
    .update({ fecha: new Date(`${fecha}T12:00:00`).toISOString() })
    .eq("id", abonoId);

  revalidatePath(`/contenedores/${contenedorId}`);
}

async function subirImagenProducto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contenedorId: string,
  formData: FormData,
): Promise<{ url: string | null; error: string | null }> {
  const imagen = formData.get("imagen");
  if (!(imagen instanceof File) || imagen.size === 0) return { url: null, error: null };

  const ruta = `${contenedorId}/${crypto.randomUUID()}-${nombreArchivoSeguro(imagen.name)}`;
  const { error } = await supabase.storage.from("productos").upload(ruta, imagen);
  if (error) return { url: null, error: error.message };

  const url = supabase.storage.from("productos").getPublicUrl(ruta).data.publicUrl;
  return { url, error: null };
}

/** Si el producto se cargó desde "mercancía pendiente en China", descuenta o
 * cierra ese pendiente según cuánto se acaba de consolidar. */
async function resolverPendienteChinaSiAplica(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contenedorId: string,
  formData: FormData,
  cantidadAgregada: number,
) {
  const pendienteId = texto(formData, "pendiente_origen_id");
  if (!pendienteId) return;

  const { data: pendiente } = await supabase
    .from("pendientes_china")
    .select("cantidad_pendiente")
    .eq("id", pendienteId)
    .single();
  if (!pendiente) return;

  const restante = pendiente.cantidad_pendiente - cantidadAgregada;
  if (restante <= 0) {
    await supabase
      .from("pendientes_china")
      .update({
        estado: "ASIGNADA",
        contenedor_asignado_id: contenedorId,
        actualizado_en: new Date().toISOString(),
      })
      .eq("id", pendienteId);
  } else {
    await supabase
      .from("pendientes_china")
      .update({ cantidad_pendiente: restante, actualizado_en: new Date().toISOString() })
      .eq("id", pendienteId);
  }
  revalidatePath("/stock/pendientes");
}

export async function agregarProducto(contenedorId: string, formData: FormData) {
  const supabase = await createClient();

  const categoria = texto(formData, "categoria") ?? "";
  const nombre = texto(formData, "nombre") ?? "";
  const sku = texto(formData, "sku") ?? skuSugerido(categoria, nombre);
  const { url: imagenSubida, error: errorImagen } = await subirImagenProducto(
    supabase,
    contenedorId,
    formData,
  );
  const imagenUrl = imagenSubida ?? texto(formData, "imagen_url_previa");
  const cantidad = numero(formData, "cantidad");

  const { data: ultimo } = await supabase
    .from("productos")
    .select("orden")
    .eq("contenedor_id", contenedorId)
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from("productos").insert({
    contenedor_id: contenedorId,
    categoria,
    fabrica: texto(formData, "fabrica"),
    proveedor: texto(formData, "proveedor"),
    imagen_url: imagenUrl,
    sku,
    nombre,
    memo: texto(formData, "memo"),
    cantidad,
    precio_dolares: numero(formData, "precio_dolares"),
    piezas_por_caja: numero(formData, "piezas_por_caja") || 1,
    largo_cm: numero(formData, "largo_cm"),
    ancho_cm: numero(formData, "ancho_cm"),
    alto_cm: numero(formData, "alto_cm"),
    orden: (ultimo?.orden ?? 0) + 1,
  });

  await resolverPendienteChinaSiAplica(supabase, contenedorId, formData, cantidad);

  revalidatePath(`/contenedores/${contenedorId}`);
  return { error: errorImagen ? `La foto no se pudo subir: ${errorImagen}` : null };
}

export async function actualizarProducto(contenedorId: string, productoId: string, formData: FormData) {
  const supabase = await createClient();

  // Si el contenedor ya se recibió, la cantidad ya NO se toca desde aquí —
  // eso movería el dato del pedido sin generar ningún ajuste de stock, y
  // se queda desalineado de lo que Stock de verdad refleja (esto pasó de
  // verdad: se "corrigió" así una cantidad y el stock nunca se enteró).
  // Para corregir cantidad de algo ya recibido existe "Editar recepción".
  const [{ data: contenedor }, { data: productoActual }] = await Promise.all([
    supabase.from("contenedores").select("stock_generado_en").eq("id", contenedorId).single(),
    supabase.from("productos").select("cantidad").eq("id", productoId).single(),
  ]);
  const yaRecibido = Boolean(contenedor?.stock_generado_en);

  const categoria = texto(formData, "categoria") ?? "";
  const nombre = texto(formData, "nombre") ?? "";
  const sku = texto(formData, "sku") ?? skuSugerido(categoria, nombre);
  const { url: imagenUrl, error: errorImagen } = await subirImagenProducto(
    supabase,
    contenedorId,
    formData,
  );

  await supabase
    .from("productos")
    .update({
      categoria,
      fabrica: texto(formData, "fabrica"),
      proveedor: texto(formData, "proveedor"),
      ...(imagenUrl ? { imagen_url: imagenUrl } : {}),
      sku,
      nombre,
      memo: texto(formData, "memo"),
      cantidad: yaRecibido ? (productoActual?.cantidad ?? 0) : numero(formData, "cantidad"),
      precio_dolares: numero(formData, "precio_dolares"),
      piezas_por_caja: numero(formData, "piezas_por_caja") || 1,
      largo_cm: numero(formData, "largo_cm"),
      ancho_cm: numero(formData, "ancho_cm"),
      alto_cm: numero(formData, "alto_cm"),
    })
    .eq("id", productoId);

  // El SKU/nombre también viven copiados en cada movimiento de stock (para
  // no depender de un join). Si se corrige el SKU aquí (ej. dos variantes
  // que quedaron con el mismo SKU por error), sin esto Stock seguiría
  // mostrándolos mezclados bajo el SKU viejo, aunque el producto ya diga
  // el nuevo.
  await supabase.from("movimientos_stock").update({ sku, nombre }).eq("producto_id", productoId);

  revalidatePath(`/contenedores/${contenedorId}`);
  revalidatePath("/stock");
  revalidatePath("/stock/movimientos");
  return { error: errorImagen ? `La foto no se pudo subir: ${errorImagen}` : null };
}

/** Al borrar un producto también se borra el stock que haya entrado a su
 * nombre — si no, se queda "fantasma" en Stock (con piezas y valor) aunque
 * el producto ya no exista en el contenedor. */
export async function eliminarProducto(contenedorId: string, productoId: string) {
  const supabase = await createClient();
  await supabase.from("movimientos_stock").delete().eq("producto_id", productoId);
  await supabase.from("productos").delete().eq("id", productoId);
  revalidatePath(`/contenedores/${contenedorId}`);
  revalidatePath("/stock");
  revalidatePath("/stock/movimientos");
}

export async function moverProducto(
  contenedorId: string,
  productos: { id: string; orden: number }[],
  productoId: string,
  direccion: "arriba" | "abajo",
) {
  const supabase = await createClient();

  const ordenados = [...productos].sort((a, b) => a.orden - b.orden);
  const indice = ordenados.findIndex((p) => p.id === productoId);
  const indiceVecino = direccion === "arriba" ? indice - 1 : indice + 1;
  if (indice === -1 || indiceVecino < 0 || indiceVecino >= ordenados.length) return;

  const actual = ordenados[indice];
  const vecino = ordenados[indiceVecino];

  await Promise.all([
    supabase.from("productos").update({ orden: vecino.orden }).eq("id", actual.id),
    supabase.from("productos").update({ orden: actual.orden }).eq("id", vecino.id),
  ]);

  revalidatePath(`/contenedores/${contenedorId}`);
}

export async function subirDocumento(contenedorId: string, tipo: TipoDocumento, formData: FormData) {
  const supabase = await createClient();

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return;

  const ruta = `${contenedorId}/${tipo}-${crypto.randomUUID()}-${nombreArchivoSeguro(archivo.name)}`;
  const { error } = await supabase.storage.from("documentos").upload(ruta, archivo);
  if (error) return;

  await supabase.from("documentos_contenedor").upsert(
    {
      contenedor_id: contenedorId,
      tipo,
      ruta_archivo: ruta,
      nombre_archivo: archivo.name,
    },
    { onConflict: "contenedor_id,tipo" },
  );

  revalidatePath(`/contenedores/${contenedorId}`);
}

export async function eliminarDocumento(contenedorId: string, documentoId: string, rutaArchivo: string) {
  const supabase = await createClient();
  await supabase.storage.from("documentos").remove([rutaArchivo]);
  await supabase.from("documentos_contenedor").delete().eq("id", documentoId);
  revalidatePath(`/contenedores/${contenedorId}`);
}

/** Guarda (o quita, si se deja en 0) el ajuste con el que Isaac explica una
 * diferencia entre lo que costó el contenedor y lo que entró a stock —
 * normalmente porque lo pagado de mercancía no cuadra exacto con la suma de
 * precios capturados por producto (ajustes de precio, cargos del banco,
 * fletes internos en China, etc.). No reparte nada por CBM ni cambia el
 * costo por pieza: solo documenta y "explica" la diferencia. */
export async function actualizarAjusteDiferencia(contenedorId: string, formData: FormData) {
  const supabase = await createClient();
  const monto = numero(formData, "ajuste_diferencia_pesos");
  const nota = texto(formData, "ajuste_diferencia_nota");

  await supabase
    .from("contenedores")
    .update({ ajuste_diferencia_pesos: monto, ajuste_diferencia_nota: nota })
    .eq("id", contenedorId);

  revalidatePath(`/contenedores/${contenedorId}`);
}

/** Calcula cuánto vale (en pesos) la mercancía de este contenedor que se
 * quedó pendiente en China pero YA se pagó — no la marca como error: es
 * dinero que salió del contenedor pero nunca entró a stock, así que es una
 * explicación real de la diferencia, no un ajuste inventado. Solo calcula
 * y regresa el resultado — no guarda nada hasta que Isaac lo confirme. */
export async function calcularPendienteChinaPagado(contenedorId: string) {
  const supabase = await createClient();

  const [{ data: contenedor }, { data: productos }, { data: pagos }, { data: pendientes }] = await Promise.all([
    supabase.from("contenedores").select("*").eq("id", contenedorId).single<Contenedor>(),
    supabase.from("productos").select("*").eq("contenedor_id", contenedorId).returns<Producto[]>(),
    supabase.from("pagos_mercancia").select("*").eq("contenedor_id", contenedorId).returns<PagoMercancia[]>(),
    supabase
      .from("pendientes_china")
      .select("*")
      .eq("contenedor_origen_id", contenedorId)
      .eq("pagado", true)
      .eq("estado", "PENDIENTE")
      .returns<PendienteChina[]>(),
  ]);

  if (!contenedor) return { error: "No se encontró el contenedor.", valor: undefined, detalle: undefined };
  const listaPendientes = pendientes ?? [];
  if (listaPendientes.length === 0) {
    return {
      error: "Este contenedor no tiene mercancía pagada pendiente en China registrada.",
      valor: undefined,
      detalle: undefined,
    };
  }

  const costoPorCbm = costoPorCbmContenedor(contenedor, productos ?? []);
  const tipoCambioMercancia = tipoCambioPromedioMercancia(pagos ?? []);
  const valor = valorPendienteChinaPagado(listaPendientes, costoPorCbm, tipoCambioMercancia);

  const detalle = `Mercancía pagada pendiente en China: ${listaPendientes
    .map((p) => `${p.nombre} (${p.cantidad_pendiente} pzas)`)
    .join(", ")} — ${formatoPesos(valor)}`;

  return { error: null, valor, detalle };
}

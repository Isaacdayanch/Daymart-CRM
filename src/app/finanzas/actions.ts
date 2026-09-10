"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { texto } from "@/lib/form-helpers";
import type { Moneda, TipoCuentaFinanciera, TipoMovimientoFinanciero } from "@/lib/tipos";

export async function agregarCuenta(formData: FormData) {
  const supabase = await createClient();
  const nombre = texto(formData, "nombre");
  const tipo = (texto(formData, "tipo") as TipoCuentaFinanciera) ?? "OTRO";
  if (!nombre) return;

  await supabase.from("cuentas_financieras").insert({ nombre, tipo });

  revalidatePath("/finanzas");
  revalidatePath("/finanzas/cuentas");
}

export async function eliminarCuenta(cuentaId: string) {
  const supabase = await createClient();
  await supabase.from("cuentas_financieras").update({ eliminado_en: new Date().toISOString() }).eq("id", cuentaId);
  revalidatePath("/finanzas");
  revalidatePath("/finanzas/cuentas");
}

export async function agregarCategoria(formData: FormData) {
  const supabase = await createClient();
  const nombre = texto(formData, "nombre");
  if (!nombre) return;

  const { data: maxOrden } = await supabase
    .from("categorias_financieras")
    .select("orden")
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle<{ orden: number }>();

  await supabase.from("categorias_financieras").insert({ nombre, orden: (maxOrden?.orden ?? 0) + 1 });

  revalidatePath("/finanzas/categorias");
}

export async function renombrarCategoria(categoriaId: string, formData: FormData) {
  const supabase = await createClient();
  const nombre = texto(formData, "nombre");
  if (!nombre) return;

  await supabase.from("categorias_financieras").update({ nombre }).eq("id", categoriaId);

  revalidatePath("/finanzas/categorias");
}

/** Las categorías "fijas" (Comisiones, Sueldo) no se pueden borrar porque
 * otras partes del sistema las usan automáticamente (el fee de un pago a
 * China, el retiro de sueldo) — si se borraran, esos movimientos se
 * quedarían sin categoría. */
export async function eliminarCategoria(categoriaId: string) {
  const supabase = await createClient();
  const { data: categoria } = await supabase
    .from("categorias_financieras")
    .select("fija")
    .eq("id", categoriaId)
    .maybeSingle<{ fija: boolean }>();
  if (categoria?.fija) return;

  await supabase.from("categorias_financieras").update({ eliminado_en: new Date().toISOString() }).eq("id", categoriaId);
  revalidatePath("/finanzas/categorias");
}

/** Registra un movimiento (entrada, salida o transferencia entre cuentas
 * propias) — la columna vertebral de Finanzas. Cuando es una salida o una
 * transferencia con comisión, el monto que se guarda en el movimiento
 * principal es el neto (lo que de verdad le llegó al destinatario o a la
 * cuenta destino) y la diferencia se guarda como un segundo movimiento de
 * salida en la categoría "Comisiones" desde la misma cuenta de origen,
 * ligado al primero — juntos suman el total que de verdad salió de la
 * cuenta, sin inflar ni duplicar nada. */
export async function registrarMovimiento(formData: FormData) {
  const supabase = await createClient();

  const tipo = formData.get("tipo") as TipoMovimientoFinanciero;
  const cuentaId = formData.get("cuenta_id") as string;
  const cuentaDestinoId = formData.get("cuenta_destino_id") as string | null;
  const categoriaId = texto(formData, "categoria_id");
  const monto = Number(formData.get("monto"));
  const moneda = (formData.get("moneda") as Moneda) || "MXN";
  const contraparte = texto(formData, "contraparte");
  const notas = texto(formData, "notas");
  const tieneComision =
    formData.get("tiene_comision") === "true" && (tipo === "SALIDA" || tipo === "TRANSFERENCIA");
  const montoNeto = Number(formData.get("monto_neto"));

  const fechaCampo = formData.get("fecha");
  const fecha =
    typeof fechaCampo === "string" && fechaCampo
      ? new Date(`${fechaCampo}T12:00:00`).toISOString()
      : new Date().toISOString();

  if (!cuentaId || !Number.isFinite(monto) || monto <= 0) {
    return { error: "Falta la cuenta o el monto no es válido." };
  }
  if (tipo === "TRANSFERENCIA" && (!cuentaDestinoId || cuentaDestinoId === cuentaId)) {
    return { error: "Elige una cuenta destino distinta a la de origen." };
  }
  if (tieneComision && (!Number.isFinite(montoNeto) || montoNeto <= 0 || montoNeto >= monto)) {
    return { error: "El monto neto debe ser mayor a cero y menor al monto que se debitó." };
  }

  const { data: principal, error: errorPrincipal } = await supabase
    .from("movimientos_financieros")
    .insert({
      tipo,
      cuenta_id: cuentaId,
      cuenta_destino_id: tipo === "TRANSFERENCIA" ? cuentaDestinoId : null,
      categoria_id: tipo === "TRANSFERENCIA" ? null : categoriaId,
      monto: tieneComision ? montoNeto : monto,
      moneda,
      fecha,
      contraparte,
      notas,
    })
    .select("id")
    .single();

  if (errorPrincipal || !principal) {
    return { error: errorPrincipal?.message ?? "No se pudo guardar el movimiento." };
  }

  if (tieneComision) {
    const { data: categoriaComisiones } = await supabase
      .from("categorias_financieras")
      .select("id")
      .eq("nombre", "Comisiones")
      .maybeSingle<{ id: string }>();

    const { error: errorComision } = await supabase.from("movimientos_financieros").insert({
      tipo: "SALIDA",
      cuenta_id: cuentaId,
      categoria_id: categoriaComisiones?.id ?? null,
      monto: monto - montoNeto,
      moneda,
      fecha,
      contraparte,
      notas: "Comisión de la transacción",
      referencia_tipo: "COMISION",
      referencia_id: principal.id,
    });
    if (errorComision) {
      return { error: `Se guardó el movimiento, pero la comisión no se pudo guardar: ${errorComision.message}` };
    }
  }

  revalidatePath("/finanzas");
  revalidatePath("/finanzas/movimientos");
  revalidatePath("/");
  return { error: null };
}

/** Da de alta una factura pendiente de pagar (proveedor de México, etc.)
 * — todavía no genera ningún movimiento, es solo el recordatorio de que se
 * debe. El movimiento real se crea hasta que se marca "Pagada". */
/** Da de alta una factura pendiente — no toca préstamos, deuda de
 * proveedores ni crédito de China, es un mundo aparte (cuentas por pagar
 * sueltas). Regresa el error real si algo falla, en vez de fallar en
 * silencio (antes esta acción no avisaba nada si el monto venía inválido). */
export async function agregarFactura(formData: FormData) {
  const supabase = await createClient();

  const folio = texto(formData, "folio");
  const proveedor = texto(formData, "proveedor");
  const concepto = texto(formData, "concepto");
  const monto = Number(formData.get("monto"));
  const moneda = (formData.get("moneda") as Moneda) || "MXN";
  const notas = texto(formData, "notas");

  if (!proveedor) return { error: "Falta el proveedor." };
  if (!Number.isFinite(monto) || monto <= 0) return { error: "El monto no es válido." };

  const fechaEmisionCampo = formData.get("fecha_emision");
  const fechaEmision =
    typeof fechaEmisionCampo === "string" && fechaEmisionCampo
      ? new Date(`${fechaEmisionCampo}T12:00:00`).toISOString()
      : new Date().toISOString();

  const fechaLimiteCampo = formData.get("fecha_limite");
  const fechaLimite =
    typeof fechaLimiteCampo === "string" && fechaLimiteCampo
      ? new Date(`${fechaLimiteCampo}T12:00:00`).toISOString()
      : null;

  const { error } = await supabase.from("facturas_pendientes").insert({
    folio,
    proveedor,
    concepto,
    monto,
    moneda,
    fecha_emision: fechaEmision,
    fecha_limite: fechaLimite,
    notas,
  });
  if (error) return { error: error.message };

  revalidatePath("/finanzas/facturas");
  return { error: null };
}

/** Registra un abono a una factura (puede ser parcial) — genera su salida
 * en Finanzas en la misma operación, igual que el resto del sistema. La
 * factura nunca guarda "pagada" a mano: su saldo se calcula sumando todos
 * sus pagos (src/lib/calculos-facturas.ts). */
export async function registrarPagoFactura(formData: FormData) {
  const supabase = await createClient();

  const facturaId = formData.get("factura_id") as string;
  const cuentaId = formData.get("cuenta_id") as string;
  const categoriaId = texto(formData, "categoria_id");
  const monto = Number(formData.get("monto"));
  const notas = texto(formData, "notas");

  if (!facturaId) return { error: "Elige qué factura vas a pagar." };
  if (!cuentaId) return { error: "Elige de qué cuenta sale el pago." };
  if (!Number.isFinite(monto) || monto <= 0) return { error: "El monto no es válido." };

  const { data: factura } = await supabase
    .from("facturas_pendientes")
    .select("proveedor, folio, moneda")
    .eq("id", facturaId)
    .maybeSingle<{ proveedor: string; folio: string | null; moneda: Moneda }>();
  if (!factura) return { error: "No se encontró la factura." };

  const fechaCampo = formData.get("fecha");
  const fecha =
    typeof fechaCampo === "string" && fechaCampo
      ? new Date(`${fechaCampo}T12:00:00`).toISOString()
      : new Date().toISOString();

  const { data: movimiento, error: errorMovimiento } = await supabase
    .from("movimientos_financieros")
    .insert({
      tipo: "SALIDA",
      cuenta_id: cuentaId,
      categoria_id: categoriaId,
      monto,
      moneda: factura.moneda,
      fecha,
      contraparte: factura.proveedor,
      notas: notas ?? (factura.folio ? `Factura ${factura.folio}` : null),
      referencia_tipo: "FACTURA",
      referencia_id: facturaId,
    })
    .select("id")
    .single();
  if (errorMovimiento || !movimiento) {
    return { error: errorMovimiento?.message ?? "No se pudo guardar el pago." };
  }

  const { error: errorPago } = await supabase.from("pagos_factura").insert({
    factura_id: facturaId,
    monto,
    fecha,
    cuenta_id: cuentaId,
    categoria_id: categoriaId,
    notas,
    movimiento_financiero_id: movimiento.id,
  });
  if (errorPago) {
    return { error: `Se guardó en Finanzas, pero no se pudo ligar el pago a la factura: ${errorPago.message}` };
  }

  revalidatePath("/finanzas/facturas");
  revalidatePath("/finanzas");
  revalidatePath("/finanzas/movimientos");
  return { error: null };
}

/** Corrige un pago de factura ya guardado — actualiza el pago Y su
 * movimiento de Finanzas ligado en la misma operación (nunca dos registros
 * sueltos que "deberían" coincidir). */
export async function actualizarPagoFactura(pagoId: string, formData: FormData) {
  const supabase = await createClient();

  const monto = Number(formData.get("monto"));
  const cuentaId = formData.get("cuenta_id") as string;
  const notas = texto(formData, "notas");
  if (!cuentaId) return { error: "Elige de qué cuenta sale el pago." };
  if (!Number.isFinite(monto) || monto <= 0) return { error: "El monto no es válido." };

  const fechaCampo = formData.get("fecha");
  const fecha =
    typeof fechaCampo === "string" && fechaCampo
      ? new Date(`${fechaCampo}T12:00:00`).toISOString()
      : new Date().toISOString();

  const { data: pago } = await supabase
    .from("pagos_factura")
    .select("movimiento_financiero_id")
    .eq("id", pagoId)
    .maybeSingle<{ movimiento_financiero_id: string | null }>();
  if (!pago) return { error: "No se encontró el pago." };

  if (pago.movimiento_financiero_id) {
    const { error: errorMovimiento } = await supabase
      .from("movimientos_financieros")
      .update({ monto, cuenta_id: cuentaId, fecha, notas })
      .eq("id", pago.movimiento_financiero_id);
    if (errorMovimiento) return { error: errorMovimiento.message };
  }

  const { error: errorPago } = await supabase
    .from("pagos_factura")
    .update({ monto, cuenta_id: cuentaId, fecha, notas })
    .eq("id", pagoId);
  if (errorPago) return { error: errorPago.message };

  revalidatePath("/finanzas/facturas");
  revalidatePath("/finanzas");
  revalidatePath("/finanzas/movimientos");
  return { error: null };
}

/** Borra un pago de factura junto con su movimiento de Finanzas ligado. */
export async function eliminarPagoFactura(pagoId: string) {
  const supabase = await createClient();

  const { data: pago } = await supabase
    .from("pagos_factura")
    .select("movimiento_financiero_id")
    .eq("id", pagoId)
    .maybeSingle<{ movimiento_financiero_id: string | null }>();

  if (pago?.movimiento_financiero_id) {
    await supabase.from("movimientos_financieros").delete().eq("id", pago.movimiento_financiero_id);
  }
  await supabase.from("pagos_factura").delete().eq("id", pagoId);

  revalidatePath("/finanzas/facturas");
  revalidatePath("/finanzas");
  revalidatePath("/finanzas/movimientos");
}

/** Solo se puede borrar una factura que todavía no tiene ningún pago
 * registrado — una con pagos ya tiene movimientos reales de Finanzas
 * ligados y borrarla los dejaría sin explicación. */
export async function eliminarFactura(facturaId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("pagos_factura")
    .select("id", { count: "exact", head: true })
    .eq("factura_id", facturaId);
  if (count && count > 0) return;

  await supabase.from("facturas_pendientes").delete().eq("id", facturaId);
  revalidatePath("/finanzas/facturas");
}

/** Registra cuánto ganó Isaac (ganancia neta, después de gastos) en un
 * periodo — es el dato del que se calcula el 10% de Maaser. No mueve
 * dinero de ninguna cuenta (la ganancia ya se refleja sola en cómo se
 * movió el dinero en Finanzas); es solo el número base del cálculo. */
export async function agregarRegistroGanancia(formData: FormData) {
  const supabase = await createClient();
  const monto = Number(formData.get("monto"));
  const notas = texto(formData, "notas");
  if (!Number.isFinite(monto) || monto <= 0) return;

  const fechaCampo = formData.get("fecha");
  const fecha =
    typeof fechaCampo === "string" && fechaCampo
      ? new Date(`${fechaCampo}T12:00:00`).toISOString()
      : new Date().toISOString();

  await supabase.from("registros_ganancia").insert({ monto, fecha, notas });
  revalidatePath("/finanzas/maaser");
}

export async function eliminarRegistroGanancia(registroId: string) {
  const supabase = await createClient();
  await supabase.from("registros_ganancia").delete().eq("id", registroId);
  revalidatePath("/finanzas/maaser");
}

export async function agregarSocio(formData: FormData) {
  const supabase = await createClient();
  const nombre = texto(formData, "nombre");
  if (!nombre) return;
  await supabase.from("socios").insert({ nombre });
  revalidatePath("/finanzas/socios");
}

/** Un aporte de capital o un reparto de un socio — genera su movimiento
 * real en Finanzas (Entrada "Aporte a capital" o Salida "Repartos") en la
 * misma operación, igual que el resto del módulo. */
export async function registrarMovimientoSocio(formData: FormData) {
  const supabase = await createClient();

  const socioId = formData.get("socio_id") as string;
  const tipo = formData.get("tipo") as "APORTE" | "REPARTO";
  const cuentaId = formData.get("cuenta_id") as string;
  const monto = Number(formData.get("monto"));
  const moneda = (formData.get("moneda") as Moneda) || "MXN";
  const notas = texto(formData, "notas");

  if (!socioId || !cuentaId || !Number.isFinite(monto) || monto <= 0) {
    return { error: "Falta el socio, la cuenta o el monto no es válido." };
  }

  const fechaCampo = formData.get("fecha");
  const fecha =
    typeof fechaCampo === "string" && fechaCampo
      ? new Date(`${fechaCampo}T12:00:00`).toISOString()
      : new Date().toISOString();

  const { data: categoria } = await supabase
    .from("categorias_financieras")
    .select("id")
    .eq("nombre", tipo === "APORTE" ? "Aporte a capital" : "Repartos")
    .maybeSingle<{ id: string }>();

  const { data: movimiento, error: errorMovimiento } = await supabase
    .from("movimientos_financieros")
    .insert({
      tipo: tipo === "APORTE" ? "ENTRADA" : "SALIDA",
      cuenta_id: cuentaId,
      categoria_id: categoria?.id ?? null,
      monto,
      moneda,
      fecha,
      notas,
    })
    .select("id")
    .single();
  if (errorMovimiento || !movimiento) {
    return { error: errorMovimiento?.message ?? "No se pudo guardar el movimiento." };
  }

  const { error: errorSocio } = await supabase.from("movimientos_socio").insert({
    socio_id: socioId,
    tipo,
    monto,
    moneda,
    fecha,
    notas,
    cuenta_id: cuentaId,
    movimiento_financiero_id: movimiento.id,
  });
  if (errorSocio) {
    return { error: `Se guardó en Finanzas, pero no se pudo ligar al socio: ${errorSocio.message}` };
  }

  revalidatePath("/finanzas/socios");
  revalidatePath("/finanzas");
  revalidatePath("/finanzas/movimientos");
  return { error: null };
}

export async function agregarPrestamista(formData: FormData) {
  const supabase = await createClient();
  const nombre = texto(formData, "nombre");
  if (!nombre) return;
  await supabase.from("prestamistas").insert({ nombre, notas: texto(formData, "notas") });
  revalidatePath("/finanzas/prestamistas");
}

/** Un préstamo recibido o un pago hecho a un prestamista — genera su
 * movimiento real en Finanzas (Entrada "Préstamo recibido" o Salida "Pago
 * préstamo") en la misma operación. */
export async function registrarMovimientoPrestamista(formData: FormData) {
  const supabase = await createClient();

  const prestamistaId = formData.get("prestamista_id") as string;
  const tipo = formData.get("tipo") as "PRESTAMO" | "PAGO";
  const cuentaId = formData.get("cuenta_id") as string;
  const monto = Number(formData.get("monto"));
  const moneda = (formData.get("moneda") as Moneda) || "MXN";
  const notas = texto(formData, "notas");

  if (!prestamistaId || !cuentaId || !Number.isFinite(monto) || monto <= 0) {
    return { error: "Falta el prestamista, la cuenta o el monto no es válido." };
  }

  const fechaCampo = formData.get("fecha");
  const fecha =
    typeof fechaCampo === "string" && fechaCampo
      ? new Date(`${fechaCampo}T12:00:00`).toISOString()
      : new Date().toISOString();

  const { data: categoria } = await supabase
    .from("categorias_financieras")
    .select("id")
    .eq("nombre", tipo === "PRESTAMO" ? "Préstamo recibido" : "Pago préstamo")
    .maybeSingle<{ id: string }>();

  const { data: movimiento, error: errorMovimiento } = await supabase
    .from("movimientos_financieros")
    .insert({
      tipo: tipo === "PRESTAMO" ? "ENTRADA" : "SALIDA",
      cuenta_id: cuentaId,
      categoria_id: categoria?.id ?? null,
      monto,
      moneda,
      fecha,
      notas,
    })
    .select("id")
    .single();
  if (errorMovimiento || !movimiento) {
    return { error: errorMovimiento?.message ?? "No se pudo guardar el movimiento." };
  }

  const { error: errorPrestamista } = await supabase.from("movimientos_prestamista").insert({
    prestamista_id: prestamistaId,
    tipo,
    monto,
    moneda,
    fecha,
    notas,
    cuenta_id: cuentaId,
    movimiento_financiero_id: movimiento.id,
  });
  if (errorPrestamista) {
    return { error: `Se guardó en Finanzas, pero no se pudo ligar al prestamista: ${errorPrestamista.message}` };
  }

  revalidatePath("/finanzas/prestamistas");
  revalidatePath("/finanzas");
  revalidatePath("/finanzas/movimientos");
  return { error: null };
}

/** Un cargo de deuda con un proveedor (ej. el costo de un pedido nuevo) es
 * solo informativo — no mueve dinero de ninguna cuenta todavía, por eso no
 * genera movimiento en Finanzas (mismo principio que registros_ganancia de
 * Maaser). */
export async function agregarCargoProveedor(formData: FormData) {
  const supabase = await createClient();
  const proveedor = texto(formData, "proveedor");
  const monto = Number(formData.get("monto"));
  const moneda = (formData.get("moneda") as Moneda) || "USD";
  if (!proveedor || !Number.isFinite(monto) || monto <= 0) return;

  const fechaCampo = formData.get("fecha");
  const fecha =
    typeof fechaCampo === "string" && fechaCampo
      ? new Date(`${fechaCampo}T12:00:00`).toISOString()
      : new Date().toISOString();

  await supabase.from("movimientos_deuda_proveedor").insert({
    proveedor,
    tipo: "CARGO",
    monto,
    moneda,
    fecha,
    notas: texto(formData, "notas"),
  });
  revalidatePath("/finanzas/proveedores");
}

/** Un abono a un proveedor sí es dinero real: genera su salida en Finanzas
 * (categoría "Pago proveedor") en la misma operación. */
export async function registrarAbonoProveedor(formData: FormData) {
  const supabase = await createClient();

  const proveedor = texto(formData, "proveedor");
  const cuentaId = formData.get("cuenta_id") as string;
  const monto = Number(formData.get("monto"));
  const moneda = (formData.get("moneda") as Moneda) || "USD";
  const notas = texto(formData, "notas");

  if (!proveedor || !cuentaId || !Number.isFinite(monto) || monto <= 0) {
    return { error: "Falta el proveedor, la cuenta o el monto no es válido." };
  }

  const fechaCampo = formData.get("fecha");
  const fecha =
    typeof fechaCampo === "string" && fechaCampo
      ? new Date(`${fechaCampo}T12:00:00`).toISOString()
      : new Date().toISOString();

  const { data: categoria } = await supabase
    .from("categorias_financieras")
    .select("id")
    .eq("nombre", "Pago proveedor")
    .maybeSingle<{ id: string }>();

  const { data: movimiento, error: errorMovimiento } = await supabase
    .from("movimientos_financieros")
    .insert({
      tipo: "SALIDA",
      cuenta_id: cuentaId,
      categoria_id: categoria?.id ?? null,
      monto,
      moneda,
      fecha,
      contraparte: proveedor,
      notas,
    })
    .select("id")
    .single();
  if (errorMovimiento || !movimiento) {
    return { error: errorMovimiento?.message ?? "No se pudo guardar el movimiento." };
  }

  const { error: errorAbono } = await supabase.from("movimientos_deuda_proveedor").insert({
    proveedor,
    tipo: "ABONO",
    monto,
    moneda,
    fecha,
    notas,
    cuenta_id: cuentaId,
    movimiento_financiero_id: movimiento.id,
  });
  if (errorAbono) {
    return { error: `Se guardó en Finanzas, pero no se pudo ligar al proveedor: ${errorAbono.message}` };
  }

  revalidatePath("/finanzas/proveedores");
  revalidatePath("/finanzas");
  revalidatePath("/finanzas/movimientos");
  return { error: null };
}

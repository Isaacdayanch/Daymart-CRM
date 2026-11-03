"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenerPerfilActual } from "@/lib/perfil";
import { numero, texto } from "@/lib/form-helpers";
import { formatoPesos } from "@/lib/formato";
import { comisionSospechosa, mensajeComisionSospechosa } from "@/lib/comisiones";
import { camposContenedorDesdePagos } from "@/lib/pagos-gastos";
import { CONCEPTOS_GASTO_CONTENEDOR, type ConceptoGastoContenedor, type Moneda, type PagoGastoContenedor } from "@/lib/tipos";
import { recalcularCostoEntradasContenedor } from "./actions";

/** Pagos de flete / aduana / otros gastos del contenedor ligados a Finanzas
 * (3 nov; Isaac: "quiero registrar el pago del forwarder en el contenedor y
 * a la vez… que salió de Jaim T."). Misma regla que los abonos de
 * mercancía: UNA sola captura — el pago guarda el id de su movimiento de
 * Finanzas; si se quita el pago, se quita el movimiento. */

const CATEGORIA_POR_CONCEPTO: Record<ConceptoGastoContenedor, string> = {
  FLETE: "Flete de contenedor",
  ADUANA: "Pago aduana",
  OTROS: "Gastos de Importación",
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function soloDueno() {
  const perfil = await obtenerPerfilActual();
  return perfil?.rol === "dueno";
}

function faltaSql(mensaje: string | undefined) {
  return mensaje && /pagos_gastos_contenedor/.test(mensaje) && /does not exist|could not find|schema cache/i.test(mensaje)
    ? "Falta correr el SQL 0062 (pagos de flete y aduana del contenedor)."
    : null;
}

/** Categoría fija de Finanzas para cada concepto: se busca por nombre y, si
 * no existe, se crea (mismo patrón que "Compras a proveedores de México"). */
async function categoriaDe(supabase: Supabase, concepto: ConceptoGastoContenedor): Promise<string | null> {
  const nombre = CATEGORIA_POR_CONCEPTO[concepto];
  const { data: existente } = await supabase.from("categorias_financieras").select("id").ilike("nombre", nombre).is("eliminado_en", null).limit(1).maybeSingle<{ id: string }>();
  if (existente) return existente.id;
  const { data: ultima } = await supabase.from("categorias_financieras").select("orden").order("orden", { ascending: false }).limit(1).maybeSingle<{ orden: number }>();
  const { data: creada } = await supabase
    .from("categorias_financieras")
    .insert({ nombre, fija: false, orden: (ultima?.orden ?? 0) + 1 })
    .select("id")
    .maybeSingle<{ id: string }>();
  if (creada) revalidatePath("/finanzas/categorias");
  return creada?.id ?? null;
}

/** Vuelve a escribir en el contenedor el monto del concepto a partir de sus
 * pagos (solo si el concepto quedó pagado completo o si ya no tiene pagos). */
async function aplicarPagosAlContenedor(supabase: Supabase, contenedorId: string, concepto: ConceptoGastoContenedor) {
  const { data: pagos, error } = await supabase.from("pagos_gastos_contenedor").select("*").eq("contenedor_id", contenedorId).returns<PagoGastoContenedor[]>();
  if (error) return error.message;
  const campos = camposContenedorDesdePagos(concepto, pagos ?? []);
  const { error: errorContenedor } = await supabase.from("contenedores").update(campos).eq("id", contenedorId);
  return errorContenedor?.message ?? null;
}

function revalidar(contenedorId: string) {
  revalidatePath(`/contenedores/${contenedorId}`);
  revalidatePath("/contenedores");
  revalidatePath("/finanzas");
  revalidatePath("/finanzas/movimientos");
  revalidatePath("/finanzas/cuentas");
  revalidatePath("/finanzas/proveedores");
  revalidatePath("/finanzas/balance");
  revalidatePath("/");
}

export async function registrarPagoGastoContenedor(
  contenedorId: string,
  concepto: ConceptoGastoContenedor,
  formData: FormData,
): Promise<{ error: string | null }> {
  if (!(await soloDueno())) return { error: "Solo el dueño puede registrar pagos." };
  const definicion = CONCEPTOS_GASTO_CONTENEDOR.find((c) => c.valor === concepto);
  if (!definicion) return { error: "Concepto no válido." };
  const supabase = await createClient();

  const { data: contenedor, error: errorContenedor } = await supabase
    .from("contenedores")
    .select("id, numero")
    .eq("id", contenedorId)
    .maybeSingle<{ id: string; numero: number }>();
  if (errorContenedor || !contenedor) return { error: "No se encontró el contenedor." };

  const cuentaId = texto(formData, "cuenta_id") || null;
  const montoPesos = numero(formData, "monto_pesos");
  const comisionPesos = numero(formData, "comision_pesos");
  const montoDolares = definicion.enDolares ? numero(formData, "monto_dolares") : 0;
  const proveedor = texto(formData, "proveedor") || null;
  const notas = texto(formData, "notas") || null;
  const completo = formData.get("completo") === "true";
  const fechaTexto = texto(formData, "fecha");
  const fecha = fechaTexto ? new Date(`${fechaTexto}T12:00:00`).toISOString() : new Date().toISOString();

  if (!Number.isFinite(montoPesos) || montoPesos <= 0) return { error: "Pon cuántos pesos salieron." };
  if (!Number.isFinite(comisionPesos) || comisionPesos < 0) return { error: "La comisión no es válida." };
  if (definicion.enDolares && !(montoDolares > 0)) return { error: `Pon cuántos dólares de ${definicion.etiqueta.toLowerCase()} pagaste con esos pesos.` };
  const totalPesos = montoPesos + comisionPesos;
  if (comisionSospechosa(comisionPesos, totalPesos)) return { error: mensajeComisionSospechosa(comisionPesos, totalPesos, formatoPesos) };

  // Deuda ya registrada en Finanzas → Proveedores a la que aplica (opcional).
  const deudaCrudo = texto(formData, "deuda_proveedor");
  const [deudaProveedor, deudaMoneda] = deudaCrudo ? (deudaCrudo.split("|") as [string, Moneda]) : [null, null];

  const etiqueta = definicion.etiqueta.toLowerCase();
  const descripcion = `${definicion.etiqueta} del contenedor ${contenedor.numero}`;
  let movimientoId: string | null = null;
  let abonoId: string | null = null;

  if (cuentaId) {
    const categoriaId = await categoriaDe(supabase, concepto);
    const { data: movimiento, error: errorMovimiento } = await supabase
      .from("movimientos_financieros")
      .insert({
        tipo: "SALIDA",
        cuenta_id: cuentaId,
        categoria_id: categoriaId,
        monto: totalPesos,
        moneda: "MXN",
        fecha,
        contraparte: proveedor ?? descripcion,
        notas: [descripcion, notas].filter(Boolean).join(" · "),
        referencia_tipo: "GASTO_CONTENEDOR",
        referencia_id: contenedorId,
      })
      .select("id")
      .single<{ id: string }>();
    if (errorMovimiento || !movimiento) return { error: `No se pudo guardar la salida en Finanzas: ${errorMovimiento?.message ?? "error desconocido"}` };
    movimientoId = movimiento.id;
  }

  if (deudaProveedor && deudaMoneda) {
    const montoAbono = deudaMoneda === "USD" ? montoDolares : totalPesos;
    const { data: abono, error: errorAbono } = await supabase
      .from("movimientos_deuda_proveedor")
      .insert({
        proveedor: deudaProveedor,
        tipo: "ABONO",
        monto: montoAbono,
        moneda: deudaMoneda,
        fecha,
        notas: descripcion,
        contenedor_id: contenedorId,
        cuenta_id: cuentaId,
        movimiento_financiero_id: movimientoId,
      })
      .select("id")
      .single<{ id: string }>();
    if (errorAbono || !abono) {
      if (movimientoId) await supabase.from("movimientos_financieros").delete().eq("id", movimientoId);
      return { error: `No se pudo abonar a la deuda de ${deudaProveedor}: ${errorAbono?.message ?? "error desconocido"}` };
    }
    abonoId = abono.id;
  }

  const { error: errorPago } = await supabase.from("pagos_gastos_contenedor").insert({
    contenedor_id: contenedorId,
    concepto,
    fecha,
    monto_pesos: montoPesos,
    comision_pesos: comisionPesos,
    monto_dolares: definicion.enDolares ? montoDolares : null,
    proveedor,
    notas,
    cuenta_id: cuentaId,
    movimiento_financiero_id: movimientoId,
    abono_deuda_id: abonoId,
  });
  if (errorPago) {
    // Todo o nada: si el pago no se pudo guardar, no queda dinero suelto en Finanzas.
    if (abonoId) await supabase.from("movimientos_deuda_proveedor").delete().eq("id", abonoId);
    if (movimientoId) await supabase.from("movimientos_financieros").delete().eq("id", movimientoId);
    return { error: faltaSql(errorPago.message) ?? `No se pudo guardar el pago de ${etiqueta}: ${errorPago.message}` };
  }

  if (completo) {
    const errorAplicar = await aplicarPagosAlContenedor(supabase, contenedorId, concepto);
    if (errorAplicar) return { error: `El pago se guardó, pero no se pudo actualizar el ${etiqueta} del contenedor: ${errorAplicar}` };
  }

  await recalcularCostoEntradasContenedor(contenedorId);
  revalidar(contenedorId);
  return { error: null };
}

export async function eliminarPagoGastoContenedor(contenedorId: string, pagoId: string): Promise<{ error: string | null }> {
  if (!(await soloDueno())) return { error: "Solo el dueño puede quitar pagos." };
  const supabase = await createClient();
  const { data: pago, error } = await supabase
    .from("pagos_gastos_contenedor")
    .select("*")
    .eq("id", pagoId)
    .eq("contenedor_id", contenedorId)
    .maybeSingle<PagoGastoContenedor>();
  if (error) return { error: faltaSql(error.message) ?? error.message };
  if (!pago) return { error: "No se encontró el pago." };

  if (pago.abono_deuda_id) await supabase.from("movimientos_deuda_proveedor").delete().eq("id", pago.abono_deuda_id);
  if (pago.movimiento_financiero_id) await supabase.from("movimientos_financieros").delete().eq("id", pago.movimiento_financiero_id);
  const { error: errorBorrar } = await supabase.from("pagos_gastos_contenedor").delete().eq("id", pagoId);
  if (errorBorrar) return { error: errorBorrar.message };

  // Si el concepto estaba PAGADO (su monto salía de los pagos), se recalcula
  // con los que quedan. Si ya no queda ninguno y el monto del contenedor era
  // justo el de este pago, vuelve a ser estimado; un monto "real" de antes
  // del sistema (sin pagos) no se toca.
  const { data: contenedor } = await supabase
    .from("contenedores")
    .select("flete_dolares, flete_estimado, aduana_pesos, aduana_estimada, otros_gastos_dolares, otros_gastos_estimado")
    .eq("id", contenedorId)
    .maybeSingle<{ flete_dolares: number; flete_estimado: boolean; aduana_pesos: number; aduana_estimada: boolean; otros_gastos_dolares: number; otros_gastos_estimado: boolean }>();
  const yaEstimado = pago.concepto === "FLETE" ? contenedor?.flete_estimado : pago.concepto === "ADUANA" ? contenedor?.aduana_estimada : contenedor?.otros_gastos_estimado;
  if (contenedor && !yaEstimado) {
    const { data: restantes } = await supabase
      .from("pagos_gastos_contenedor")
      .select("id")
      .eq("contenedor_id", contenedorId)
      .eq("concepto", pago.concepto);
    const montoActual = pago.concepto === "FLETE" ? Number(contenedor.flete_dolares) : pago.concepto === "ADUANA" ? Number(contenedor.aduana_pesos) : Number(contenedor.otros_gastos_dolares);
    const montoDelPago = pago.concepto === "ADUANA" ? Number(pago.monto_pesos) + Number(pago.comision_pesos) : Number(pago.monto_dolares) || 0;
    const veniaDelPago = Math.abs(montoActual - montoDelPago) < 0.01;
    if ((restantes?.length ?? 0) > 0 || veniaDelPago) {
      const errorAplicar = await aplicarPagosAlContenedor(supabase, contenedorId, pago.concepto);
      if (errorAplicar) return { error: `El pago se quitó, pero no se pudo actualizar el contenedor: ${errorAplicar}` };
    }
  }

  await recalcularCostoEntradasContenedor(contenedorId);
  revalidar(contenedorId);
  return { error: null };
}

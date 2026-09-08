import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resumenPorSku } from "@/lib/calculos-stock";
import { obtenerPiezasPorCajaPorSku } from "@/lib/productos-stock";
import type { Contenedor, CuentaFinanciera, MovimientoFinanciero, MovimientoStock, CategoriaFinanciera, ConfiguracionStock } from "@/lib/tipos";

/** Respaldo de solo lectura para Google Sheets (vía Apps Script) — pensado
 * para que Isaac tenga dónde ver sus datos si el sistema llegara a fallar.
 * Usa la service role key (nunca la anon key) porque quien llama esto no
 * tiene sesión de Supabase — la única puerta es la clave secreta
 * (RESPALDO_SECRET), nunca expuesta al navegador. No se debe reutilizar
 * este patrón para nada que el navegador necesite tocar. */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const clave = request.nextUrl.searchParams.get("clave");
  const secreto = process.env.RESPALDO_SECRET;
  if (!secreto || !clave || clave !== secreto) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        error: "Faltan variables de entorno.",
        tiene_url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        tiene_service_role_key: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      },
      { status: 500 },
    );
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const [
    { data: movimientosFinancieros, error: errorFinanzas },
    { data: cuentas, error: errorCuentas },
    { data: categorias, error: errorCategorias },
    { data: movimientosStock, error: errorStock },
    { data: configuracion, error: errorConfiguracion },
    { data: contenedores, error: errorContenedores },
    piezasPorCajaPorSku,
  ] = await Promise.all([
    supabase
      .from("movimientos_financieros")
      .select("*")
      .order("fecha", { ascending: false })
      .returns<MovimientoFinanciero[]>(),
    supabase.from("cuentas_financieras").select("*").returns<CuentaFinanciera[]>(),
    supabase.from("categorias_financieras").select("*").returns<CategoriaFinanciera[]>(),
    supabase.from("movimientos_stock").select("*").returns<MovimientoStock[]>(),
    supabase.from("configuracion_stock").select("*").single<ConfiguracionStock>(),
    supabase
      .from("contenedores")
      .select("*")
      .is("eliminado_en", null)
      .order("numero", { ascending: false })
      .returns<Contenedor[]>(),
    obtenerPiezasPorCajaPorSku(supabase),
  ]);

  const errores = {
    finanzas: errorFinanzas?.message,
    cuentas: errorCuentas?.message,
    categorias: errorCategorias?.message,
    stock: errorStock?.message,
    configuracion: errorConfiguracion?.message,
    contenedores: errorContenedores?.message,
  };
  if (Object.values(errores).some(Boolean)) {
    return NextResponse.json({ error: "Error consultando Supabase.", detalle: errores }, { status: 500 });
  }

  const cuentasPorId = new Map((cuentas ?? []).map((c) => [c.id, c.nombre]));
  const categoriasPorId = new Map((categorias ?? []).map((c) => [c.id, c.nombre]));

  const finanzas = (movimientosFinancieros ?? []).map((m) => ({
    fecha: m.fecha,
    tipo: m.tipo,
    cuenta: cuentasPorId.get(m.cuenta_id) ?? "",
    cuenta_destino: m.cuenta_destino_id ? (cuentasPorId.get(m.cuenta_destino_id) ?? "") : "",
    categoria: m.categoria_id ? (categoriasPorId.get(m.categoria_id) ?? "") : "",
    monto: m.monto,
    moneda: m.moneda,
    contraparte: m.contraparte ?? "",
    notas: m.notas ?? "",
  }));

  const resumenes = resumenPorSku(movimientosStock ?? [], configuracion?.dias_espera ?? 60, piezasPorCajaPorSku);
  const stock = resumenes.map((r) => ({
    sku: r.sku,
    nombre: r.nombre,
    stock_actual: r.stockActual,
    cajas: r.cajas,
    costo_promedio: r.costoPromedio,
    valor_inventario: r.valorInventario,
  }));

  const listaContenedores = (contenedores ?? []).map((c) => ({
    numero: c.numero,
    booking: c.booking ?? "",
    estado: c.estado,
    fabrica_principal: c.fabrica_principal ?? "",
    proveedor_principal: c.proveedor_principal ?? "",
    creado_en: c.creado_en,
  }));

  return NextResponse.json({ finanzas, stock, contenedores: listaContenedores });
}

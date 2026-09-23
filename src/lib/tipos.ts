export type Rol = "dueno" | "operadora";

export interface Perfil {
  id: string;
  rol: Rol;
  nombre: string | null;
  creado_en: string;
}

export type EstadoContenedor =
  | "CONFIGURANDOSE"
  | "EN_TRANSITO"
  | "RECIBIDO_PUERTO"
  | "LIBERADO_ADUANA"
  | "RECIBIDO_BODEGA";

export const ESTADOS_CONTENEDOR: { valor: EstadoContenedor; etiqueta: string }[] = [
  { valor: "CONFIGURANDOSE", etiqueta: "Configurándose" },
  { valor: "EN_TRANSITO", etiqueta: "En tránsito" },
  { valor: "RECIBIDO_PUERTO", etiqueta: "Recibido en puerto" },
  { valor: "LIBERADO_ADUANA", etiqueta: "Liberado de aduana" },
  { valor: "RECIBIDO_BODEGA", etiqueta: "Recibido en bodega" },
];

export interface Contenedor {
  id: string;
  numero: number;
  booking: string | null;
  estado: EstadoContenedor;
  flete_dolares: number;
  flete_tipo_cambio: number;
  aduana_pesos: number;
  otros_gastos_dolares: number;
  otros_gastos_tipo_cambio: number;
  fabrica_principal: string | null;
  proveedor_principal: string | null;
  ajuste_diferencia_pesos: number;
  ajuste_diferencia_nota: string | null;
  /** Días de crédito que da el proveedor, contados desde que el
   * contenedor pasa a "En tránsito". null = sin crédito. */
  credito_dias: number | null;
  /** true mientras el monto sea una estimación de Isaac (todavía no llega
   * la factura real) — se muestra en ámbar para que no se confunda. */
  flete_estimado: boolean;
  aduana_estimada: boolean;
  otros_gastos_estimado: boolean;
  eliminado_en: string | null;
  stock_generado_en: string | null;
  creado_en: string;
  actualizado_en: string;
}

export type TipoDocumento =
  | "TELEX"
  | "PACKING_LIST"
  | "INVOICE"
  | "TELEX_RELEASE"
  | "BL"
  | "HBL";

export const TIPOS_DOCUMENTO: { valor: TipoDocumento; etiqueta: string }[] = [
  { valor: "TELEX", etiqueta: "Telex" },
  { valor: "PACKING_LIST", etiqueta: "Packing list (proveedor)" },
  { valor: "INVOICE", etiqueta: "Invoice (proveedor)" },
  { valor: "TELEX_RELEASE", etiqueta: "Telex release" },
  { valor: "BL", etiqueta: "BL" },
  { valor: "HBL", etiqueta: "HBL" },
];

export interface DocumentoContenedor {
  id: string;
  contenedor_id: string;
  tipo: TipoDocumento;
  ruta_archivo: string;
  nombre_archivo: string;
  subido_en: string;
}

export interface HistorialEstado {
  id: string;
  contenedor_id: string;
  estado: EstadoContenedor;
  fecha: string;
}

export interface PagoMercancia {
  id: string;
  contenedor_id: string;
  monto_dolares: number;
  tipo_cambio: number;
  pagado: boolean;
  fecha: string | null;
  notas: string | null;
  cuenta_id: string | null;
  movimiento_financiero_id: string | null;
  /** Solo para abonos "Pendiente" con crédito: fecha de salida de China +
   * credito_dias del contenedor. Editable a mano. */
  fecha_limite: string | null;
  /** Cargo que este abono pendiente generó en Finanzas → Proveedores. */
  cargo_deuda_id: string | null;
  creado_en: string;
}

export interface Marca {
  id: string;
  nombre: string;
  /** 3 letras que encabezan el SKU (DAY, MAM…). */
  codigo: string;
  notas: string | null;
  creado_en: string;
  eliminado_en: string | null;
}

/** Un registro por SKU: la "ficha" del producto, fuera de cualquier
 * contenedor (migración 0038). */
export interface ProductoCatalogo {
  sku: string;
  nombre: string;
  marca_id: string | null;
  linea: string | null;
  categoria: string | null;
  imagen_url: string | null;
  piezas_por_caja: number;
  largo_cm: number;
  ancho_cm: number;
  alto_cm: number;
  memo: string | null;
  creado_en: string;
  actualizado_en: string;
  eliminado_en: string | null;
}

export interface Producto {
  id: string;
  contenedor_id: string;
  categoria: string;
  /** Marca del producto (migración 0038); null en productos viejos. */
  marca_id?: string | null;
  fabrica: string | null;
  proveedor: string | null;
  imagen_url: string | null;
  sku: string;
  nombre: string;
  memo: string | null;
  cantidad: number;
  precio_dolares: number;
  piezas_por_caja: number;
  largo_cm: number;
  ancho_cm: number;
  alto_cm: number;
  orden: number;
  creado_en: string;
  actualizado_en: string;
}

export interface Bodega {
  id: string;
  nombre: string;
  eliminado_en: string | null;
  creado_en: string;
}

export type TipoMovimiento = "ENTRADA" | "SALIDA" | "AJUSTE";

export interface MovimientoStock {
  id: string;
  tipo: TipoMovimiento;
  sku: string;
  nombre: string;
  bodega_id: string;
  cantidad: number;
  piezas_por_caja: number;
  imagen_url: string | null;
  costo_unitario_pesos: number;
  contenedor_id: string | null;
  producto_id: string | null;
  /** Venta directa que generó esta salida (Módulo Ventas). */
  venta_id: string | null;
  /** Orden de Mercado Libre que generó esta salida (migración 0035). */
  orden_ml_id?: number | null;
  /** Envío a Full que generó esta salida (migración 0035). */
  envio_full_id?: string | null;
  recepcion_full_id?: string | null;
  destino: string | null;
  referencia: string | null;
  creado_en: string;
  /** Movimiento "de antes del sistema" (migración 0039): no cuenta para la rotación. */
  historico?: boolean;
}

export const CATEGORIAS_SALIDA = ["Full", "Paquetería", "Piezas", "Muestra", "Devolución", "Ajuste"] as const;

export type EstadoPendienteChina = "PENDIENTE" | "ASIGNADA" | "CANCELADA";

export interface PendienteChina {
  id: string;
  contenedor_origen_id: string | null;
  sku: string;
  nombre: string;
  categoria: string | null;
  fabrica: string | null;
  proveedor: string | null;
  imagen_url: string | null;
  memo: string | null;
  precio_dolares: number;
  piezas_por_caja: number;
  largo_cm: number;
  ancho_cm: number;
  alto_cm: number;
  cantidad_pendiente: number;
  pagado: boolean;
  notas: string | null;
  estado: EstadoPendienteChina;
  contenedor_asignado_id: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface ConfiguracionStock {
  id: number;
  dias_espera: number;
  /** Desde qué fecha se generan salidas automáticas por ventas de ML (null = apagado). */
  salidas_ml_desde?: string | null;
}

export interface EnvioChina {
  id: string;
  estado: "PENDIENTE" | "COMPLETADO" | "CANCELADO";
  cuenta_origen_id: string | null;
  cuenta_puente_id: string | null;
  movimiento_transferencia_id: string | null;
  proveedor: string;
  moneda_proveedor: Moneda;
  contenedor_id: string | null;
  abono_pendiente_id: string | null;
  monto_pesos: number;
  comision_pesos: number | null;
  monto_dolares: number | null;
  fecha: string;
  notas: string | null;
  creado_en: string;
  completado_en: string | null;
  movimiento_envio_id: string | null;
}

export type EstadoEnvioFull = "PREPARADO" | "RECIBIDO" | "CANCELADO";

export interface EnvioFull {
  id: string;
  numero: number;
  fecha: string;
  bodega_id: string | null;
  color_etiqueta: string | null;
  notas: string | null;
  estado: EstadoEnvioFull;
  creado_en: string;
  cerrado_en: string | null;
}

export interface EnvioFullLinea {
  id: string;
  envio_id: string;
  sku: string;
  nombre: string;
  imagen_url: string | null;
  piezas_por_caja: number;
  cantidad_enviada: number;
  cantidad_recibida: number;
  merma: number;
  resuelta: boolean;
  creado_en: string;
}

export interface RecepcionFull {
  id: string;
  inventory_id: string;
  item_id: string | null;
  variation_id: number | null;
  titulo: string | null;
  sku_crm: string | null;
  cantidad: number;
  total_antes: number;
  total_despues: number;
  detectado_en: string;
  atendido_en: string | null;
  decision: "SALIDA" | "IGNORADA" | null;
  envio_id: string | null;
  movimiento_stock_id: string | null;
}

export type TipoCuentaFinanciera = "EFECTIVO" | "BANCO" | "OTRO";

export interface CuentaFinanciera {
  id: string;
  nombre: string;
  tipo: TipoCuentaFinanciera;
  // "De tránsito": no cuenta como saldo real en el Balance (ej. Mercado
  // Pago) — solo sirve para etiquetar de dónde salió un gasto.
  cuenta_transito: boolean;
  eliminado_en: string | null;
  creado_en: string;
}

export interface CategoriaFinanciera {
  id: string;
  nombre: string;
  fija: boolean;
  orden: number;
  eliminado_en: string | null;
  creado_en: string;
}

export type TipoMovimientoFinanciero = "ENTRADA" | "SALIDA" | "TRANSFERENCIA";
export type Moneda = "MXN" | "USD";

export interface MovimientoFinanciero {
  id: string;
  tipo: TipoMovimientoFinanciero;
  cuenta_id: string;
  cuenta_destino_id: string | null;
  categoria_id: string | null;
  monto: number;
  moneda: Moneda;
  fecha: string;
  contraparte: string | null;
  notas: string | null;
  referencia_tipo: string | null;
  referencia_id: string | null;
  /** true = falta registrar la comisión de esta transacción (migración 0036). */
  comision_pendiente?: boolean;
  creado_en: string;
}

export interface Socio {
  id: string;
  nombre: string;
  creado_en: string;
}

export type TipoMovimientoSocio = "APORTE" | "REPARTO";

export interface MovimientoSocio {
  id: string;
  socio_id: string;
  tipo: TipoMovimientoSocio;
  monto: number;
  moneda: Moneda;
  fecha: string;
  notas: string | null;
  cuenta_id: string | null;
  movimiento_financiero_id: string | null;
  creado_en: string;
}

export interface Prestamista {
  id: string;
  nombre: string;
  notas: string | null;
  creado_en: string;
}

export type TipoMovimientoPrestamista = "PRESTAMO" | "PAGO";

export interface MovimientoPrestamista {
  id: string;
  prestamista_id: string;
  tipo: TipoMovimientoPrestamista;
  monto: number;
  moneda: Moneda;
  fecha: string;
  notas: string | null;
  cuenta_id: string | null;
  movimiento_financiero_id: string | null;
  creado_en: string;
}

export type TipoMovimientoDeudaProveedor = "CARGO" | "ABONO";

export interface MovimientoDeudaProveedor {
  id: string;
  proveedor: string;
  tipo: TipoMovimientoDeudaProveedor;
  monto: number;
  moneda: Moneda;
  fecha: string;
  // Solo aplica a tipo CARGO — cada cargo tiene su propia fecha límite (no
  // una sola por proveedor). Los abonos se aplican al cargo más viejo
  // primero (FIFO) para saber cuál sigue abierto.
  fecha_limite: string | null;
  notas: string | null;
  contenedor_id: string | null;
  cuenta_id: string | null;
  movimiento_financiero_id: string | null;
  creado_en: string;
}

export interface RegistroGanancia {
  id: string;
  monto: number;
  fecha: string;
  notas: string | null;
  creado_en: string;
}

export interface FacturaPendiente {
  id: string;
  folio: string | null;
  proveedor: string;
  concepto: string | null;
  monto: number;
  moneda: Moneda;
  fecha_emision: string;
  fecha_limite: string | null;
  pagada: boolean;
  movimiento_financiero_id: string | null;
  notas: string | null;
  creado_en: string;
}

export interface PagoFactura {
  id: string;
  factura_id: string;
  monto: number;
  fecha: string;
  /** null = pago de antes de usar el sistema, no toca ninguna cuenta real. */
  cuenta_id: string | null;
  categoria_id: string | null;
  notas: string | null;
  movimiento_financiero_id: string | null;
  creado_en: string;
}

export type EstadoResearch = "BORRADOR" | "CONVERTIDO" | "DESCARTADO";

export interface ResearchProducto {
  id: string;
  link_mercado_libre: string | null;
  nombre: string;
  imagen_url: string | null;
  categoria_ml_id: string | null;
  categoria_ml_nombre: string | null;
  precio_referencia_ml: number;
  ventas_ml: number | null;
  precio_venta: number;
  precio_compra_dolares: number;
  tipo_cambio_estimado: number;
  piezas_por_caja: number;
  largo_cm: number;
  ancho_cm: number;
  alto_cm: number;
  costo_por_cbm_pesos: number;
  paquete_largo_cm: number;
  paquete_ancho_cm: number;
  paquete_alto_cm: number;
  paquete_peso_fisico_kg: number | null;
  comision_ml_pct: number;
  envio_gratis: boolean;
  costo_envio_pesos: number;
  costo_estimado_pieza_pesos: number;
  margen_estimado_pesos: number;
  margen_estimado_pct: number;
  notas: string | null;
  estado: EstadoResearch;
  contenedor_asignado_id: string | null;
  creado_en: string;
  actualizado_en: string;
}

// ---------- Ventas directas (a clientes, fuera de Mercado Libre) ----------

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string | null;
  notas: string | null;
  /** Días de crédito habituales: se proponen al hacerle una venta a crédito. */
  dias_credito: number | null;
  eliminado_en: string | null;
  creado_en: string;
}

export type FormaPagoVenta = "CONTADO" | "CREDITO";

export const FORMAS_PAGO_VENTA: { valor: FormaPagoVenta; etiqueta: string }[] = [
  { valor: "CONTADO", etiqueta: "De contado" },
  { valor: "CREDITO", etiqueta: "A crédito" },
];

export const IVA_PCT = 16;

export interface Venta {
  id: string;
  numero: number;
  cliente_id: string;
  bodega_id: string;
  fecha: string;
  forma_pago: FormaPagoVenta;
  /** true = al subtotal se le suma el IVA (los precios se capturan sin IVA). */
  con_iva: boolean;
  fecha_limite: string | null;
  notas: string | null;
  creado_en: string;
}

export interface VentaLinea {
  id: string;
  venta_id: string;
  sku: string;
  nombre: string;
  imagen_url: string | null;
  cantidad: number;
  precio_unitario: number;
  /** Costo promedio del SKU al momento de vender (para el margen). */
  costo_unitario: number;
  orden: number;
}

export interface CobroVenta {
  id: string;
  venta_id: string;
  monto: number;
  fecha: string;
  cuenta_id: string;
  notas: string | null;
  movimiento_financiero_id: string | null;
  creado_en: string;
}

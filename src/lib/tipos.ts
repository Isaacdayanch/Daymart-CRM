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
  creado_en: string;
}

export interface Producto {
  id: string;
  contenedor_id: string;
  categoria: string;
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
  destino: string | null;
  referencia: string | null;
  creado_en: string;
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
}

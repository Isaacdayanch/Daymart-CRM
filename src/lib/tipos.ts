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
  creado_en: string;
  actualizado_en: string;
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
  creado_en: string;
  actualizado_en: string;
}

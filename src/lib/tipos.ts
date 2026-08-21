export type EstadoContenedor =
  | "EN_TRANSITO"
  | "DEPOSIT_PAID"
  | "DEPOSIT_PAID_10K_RECEIVED"
  | "FULLY_PAID"
  | "RECEIVED";

export const ESTADOS_CONTENEDOR: { valor: EstadoContenedor; etiqueta: string }[] = [
  { valor: "EN_TRANSITO", etiqueta: "En tránsito" },
  { valor: "DEPOSIT_PAID", etiqueta: "Depósito pagado" },
  { valor: "DEPOSIT_PAID_10K_RECEIVED", etiqueta: "Depósito 10K recibido" },
  { valor: "FULLY_PAID", etiqueta: "Pagado completo" },
  { valor: "RECEIVED", etiqueta: "Recibido" },
];

export interface Contenedor {
  id: string;
  numero: number;
  barco: string | null;
  booking: string | null;
  estado: EstadoContenedor;
  flete: number;
  aduana: number;
  mercancia: number;
  tipo_cambio: number;
  creado_en: string;
  actualizado_en: string;
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

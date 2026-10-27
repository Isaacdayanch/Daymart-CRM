import { EsqueletoContenido } from "@/components/esqueleto";

// Pantalla de carga al cambiar de pestaña dentro de Ventas (velocidad, 22 oct).
export default function Cargando() {
  return <EsqueletoContenido tarjetas={3} />;
}

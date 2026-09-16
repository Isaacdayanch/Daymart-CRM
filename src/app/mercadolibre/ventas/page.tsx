import { redirect } from "next/navigation";

/** La lista de ventas ahora es la pantalla principal de Mercado Libre. */
export default function VentasRedirect() {
  redirect("/mercadolibre");
}

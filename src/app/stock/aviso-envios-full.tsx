import Link from "next/link";
import { DIAS_EN_CAMINO_AVISO, diasEnCamino, faseDe, obtenerEnviosFullMl, recepcionesSinExplicar } from "@/lib/mercadolibre-envios-full";

/** Aviso arriba de todas las pantallas de Stock: lo que falta hacer con los
 * envíos a Full para que la bodega quede bien (diferencias por resolver,
 * envíos tardados, productos sin ligar, subidas en Full sin envío). */
export async function AvisoEnviosFull() {
  let avisos: { texto: string; ancla: string }[] = [];
  try {
    const [envios, sinExplicar] = await Promise.all([obtenerEnviosFullMl(), recepcionesSinExplicar()]);
    const ids = (lista: { envio: { inbound_id: string } }[]) => lista.map((e) => e.envio.inbound_id).join(", ");
    const porCerrar = envios.filter((e) => faseDe(e.envio) === "POR_CERRAR");
    const pendientes = envios.filter((e) => faseDe(e.envio) === "PENDIENTE_REGISTRAR");
    const tardados = envios.filter((e) => faseDe(e.envio) === "EN_CAMINO" && diasEnCamino(e.envio) >= DIAS_EN_CAMINO_AVISO);
    const sinLigar = envios.filter((e) => ["EN_CAMINO", "POR_CERRAR", "CERRADO"].includes(faseDe(e.envio)) && e.lineas.some((l) => !l.salida_generada_en));
    avisos = [
      porCerrar.length ? { texto: `${porCerrar.length === 1 ? "El envío" : "Los envíos"} ${ids(porCerrar)} ya ${porCerrar.length === 1 ? "llegó" : "llegaron"} a Full con diferencias por resolver.`, ancla: "#envios-ml" } : null,
      pendientes.length ? { texto: `${pendientes.length === 1 ? "El envío" : "Los envíos"} ${ids(pendientes)} ${pendientes.length === 1 ? "está capturado" : "están capturados"} pero todavía no se ${pendientes.length === 1 ? "descuenta" : "descuentan"} de tu bodega.`, ancla: "#envios-ml" } : null,
      tardados.length ? { texto: `${tardados.length === 1 ? "El envío" : "Los envíos"} ${ids(tardados)} ${tardados.length === 1 ? "lleva" : "llevan"} más de ${DIAS_EN_CAMINO_AVISO} días en camino: si ML ya lo recibió, ciérralo.`, ancla: "#envios-ml" } : null,
      sinLigar.length ? { texto: `${sinLigar.length === 1 ? "El envío" : "Los envíos"} ${ids(sinLigar)} ${sinLigar.length === 1 ? "tiene" : "tienen"} productos sin ligar: esas piezas todavía no se descuentan de tu bodega.`, ancla: "#envios-ml" } : null,
      sinExplicar.length ? { texto: `Subió el stock en Full de ${sinExplicar.length} producto(s) y no hay ningún envío capturado que lo explique: ¿se te olvidó capturar un envío?`, ancla: "#sin-explicar" } : null,
    ].filter((a): a is { texto: string; ancla: string } => Boolean(a));
  } catch {
    return null;
  }
  if (!avisos.length) return null;
  return (
    <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 print:hidden">
      <p className="font-medium">Envíos a Full: hay algo que revisar</p>
      <ul className="mt-1 space-y-0.5 text-xs text-amber-800">
        {avisos.map((a) => (
          <li key={a.texto}>
            {a.texto}{" "}
            <Link href={`/stock/full${a.ancla}`} className="font-medium underline underline-offset-2">
              Ir →
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

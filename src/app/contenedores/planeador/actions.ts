"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenerPerfilActual } from "@/lib/perfil";
import { columnaFaltante, sinColumnasFaltantes } from "@/lib/columnas-faltantes";
import { camposCopiadosDe, piezasAMover, siguienteNumeroContenedor } from "@/lib/planeador";
import type { Contenedor, PrioridadProducto, Producto } from "@/lib/tipos";

async function soloDueno() {
  const perfil = await obtenerPerfilActual();
  return perfil?.rol === "dueno";
}

function revalidarPlaneador(contenedorIds: string[]) {
  revalidatePath("/contenedores/planeador");
  revalidatePath("/contenedores");
  revalidatePath("/contenedores/productos");
  for (const id of contenedorIds) revalidatePath(`/contenedores/${id}`);
}

function faltaSql0059(mensaje: string | null | undefined) {
  return /traslados_producto|prioridad/.test(mensaje ?? "") && /does not exist|schema cache|Could not find/.test(mensaje ?? "");
}

/** Pasa `cantidad` piezas de un producto a otro contenedor que también se
 * está configurando. Si se mueven TODAS, el producto cambia de contenedor
 * (se va al final de la lista del destino). Si solo una parte, se crea en
 * el destino una fila igual con esas piezas y el original se queda con el
 * resto. Los abonos de mercancía NO se mueven (son dinero real del
 * contenedor de origen); el planeador avisa si quedan de más. */
export async function moverProductoAContenedor(
  productoId: string,
  destinoId: string,
  cantidadPedida: number,
): Promise<{ error: string | null; parcial?: boolean; cantidad?: number }> {
  if (!(await soloDueno())) return { error: "Solo el dueño puede mover productos entre contenedores." };
  const supabase = await createClient();

  const { data: producto, error: errorProducto } = await supabase.from("productos").select("*").eq("id", productoId).maybeSingle<Producto>();
  if (errorProducto || !producto) return { error: `No se encontró el producto${errorProducto ? `: ${errorProducto.message}` : ""}.` };
  if (producto.contenedor_id === destinoId) return { error: "Ese producto ya está en ese contenedor." };

  const { data: contenedores } = await supabase.from("contenedores").select("*").in("id", [producto.contenedor_id, destinoId]).returns<Contenedor[]>();
  const origen = contenedores?.find((c) => c.id === producto.contenedor_id);
  const destino = contenedores?.find((c) => c.id === destinoId);
  if (!origen || !destino) return { error: "No se encontró el contenedor de origen o el de destino." };
  if (destino.eliminado_en) return { error: `El contenedor #${destino.numero} está en la papelera.` };
  if (origen.estado !== "CONFIGURANDOSE") return { error: `El contenedor #${origen.numero} ya no está configurándose: no se puede sacar mercancía de él.` };
  if (destino.estado !== "CONFIGURANDOSE") return { error: `El contenedor #${destino.numero} ya no está configurándose: solo se puede mover a uno que todavía se esté armando.` };

  const cantidad = piezasAMover(producto, cantidadPedida);
  if (cantidad <= 0) return { error: "Pon cuántas piezas quieres mover (al menos 1)." };
  const parcial = cantidad < producto.cantidad;

  const { data: ultimo } = await supabase
    .from("productos")
    .select("orden")
    .eq("contenedor_id", destinoId)
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle<{ orden: number }>();
  const orden = (ultimo?.orden ?? 0) + 1;

  let productoDestinoId = productoId;
  if (!parcial) {
    const { error } = await supabase.from("productos").update({ contenedor_id: destinoId, orden }).eq("id", productoId);
    if (error) return { error: `No se pudo mover el producto: ${error.message}` };
  } else {
    // Misma ficha (foto, precio, medidas, mancuerna, código ML…) con las
    // piezas que se van; el original se queda con el resto.
    const ficha: Record<string, unknown> = { ...producto };
    delete ficha.id;
    delete ficha.creado_en;
    delete ficha.actualizado_en;
    const creado = { id: null as string | null };
    const { error } = await sinColumnasFaltantes({ ...ficha, contenedor_id: destinoId, cantidad, orden }, async (fila) => {
      const r = await supabase.from("productos").insert(fila).select("id").single<{ id: string }>();
      creado.id = r.data?.id ?? null;
      return r;
    });
    if (error) return { error: `No se pudo crear el producto en el contenedor #${destino.numero}: ${error}` };
    productoDestinoId = creado.id ?? productoId;
    const { error: errorResto } = await supabase.from("productos").update({ cantidad: producto.cantidad - cantidad }).eq("id", productoId);
    if (errorResto) {
      return { error: `Se copiaron ${cantidad} piezas al #${destino.numero}, pero no se pudo descontar del #${origen.numero}: ${errorResto.message}. Corrige la cantidad a mano.` };
    }
  }

  // Historial del traslado (si falta el SQL 0059 no truena: el movimiento ya se hizo).
  await supabase.from("traslados_producto").insert({
    producto_id: productoDestinoId,
    sku: producto.sku,
    nombre: producto.nombre,
    cantidad,
    parcial,
    origen_contenedor_id: origen.id,
    destino_contenedor_id: destino.id,
    origen_numero: origen.numero,
    destino_numero: destino.numero,
  });

  revalidarPlaneador([origen.id, destino.id]);
  return { error: null, parcial, cantidad };
}

/** Crea el siguiente contenedor (número más alto + 1) en "Configurándose"
 * copiando del de origen el proveedor, el límite de peso, la capacidad y
 * los gastos estimados (ver `camposCopiadosDe`). */
export async function crearContenedorSiguiente(desdeId: string): Promise<{ error: string | null; id: string | null; numero: number | null }> {
  if (!(await soloDueno())) return { error: "Solo el dueño puede crear contenedores.", id: null, numero: null };
  const supabase = await createClient();

  const { data: todos, error: errorLista } = await supabase.from("contenedores").select("*").returns<Contenedor[]>();
  if (errorLista) return { error: `No se pudieron leer los contenedores: ${errorLista.message}`, id: null, numero: null };
  const origen = (todos ?? []).find((c) => c.id === desdeId);
  if (!origen) return { error: "No se encontró el contenedor de origen.", id: null, numero: null };
  const numero = siguienteNumeroContenedor(todos ?? []);

  const creado = { id: null as string | null };
  const { error } = await sinColumnasFaltantes(
    { numero, booking: null, estado: "CONFIGURANDOSE", ...camposCopiadosDe(origen) },
    async (fila) => {
      const r = await supabase.from("contenedores").insert(fila).select("id").single<{ id: string }>();
      creado.id = r.data?.id ?? null;
      return r;
    },
  );
  if (error || !creado.id) return { error: `No se pudo crear el contenedor #${numero}: ${error ?? "sin respuesta"}`, id: null, numero: null };

  await supabase.from("historial_estados_contenedor").insert({ contenedor_id: creado.id, estado: "CONFIGURANDOSE" });

  revalidarPlaneador([creado.id]);
  revalidatePath("/");
  return { error: null, id: creado.id, numero };
}

/** Urgencia del producto (Urgente / Normal / Puede esperar). */
export async function cambiarPrioridadProducto(productoId: string, prioridad: PrioridadProducto): Promise<{ error: string | null }> {
  if (!(await soloDueno())) return { error: "Solo el dueño puede cambiar la urgencia." };
  if (!["URGENTE", "NORMAL", "PUEDE_ESPERAR"].includes(prioridad)) return { error: "Urgencia no válida." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("productos").update({ prioridad }).eq("id", productoId).select("contenedor_id").maybeSingle<{ contenedor_id: string }>();
  if (error) {
    if (columnaFaltante(error.message) === "prioridad" || faltaSql0059(error.message)) {
      return { error: "Falta correr el SQL 0059 en Supabase para poder guardar la urgencia." };
    }
    return { error: `No se pudo guardar la urgencia: ${error.message}` };
  }
  revalidarPlaneador(data?.contenedor_id ? [data.contenedor_id] : []);
  return { error: null };
}

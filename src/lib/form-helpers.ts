// Helpers de lectura de FormData compartidos entre varias server actions.
// (No lleva "use server": esas solo pueden exportar funciones async.)

export function numero(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return valor ? Number(valor) : 0;
}

export function texto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

/** Quita acentos y cualquier carácter que no sea letra/número/guion, para
 * que el nombre del archivo sea una llave de almacenamiento válida. */
export function nombreArchivoSeguro(nombre: string) {
  const puntoFinal = nombre.lastIndexOf(".");
  const base = puntoFinal > 0 ? nombre.slice(0, puntoFinal) : nombre;
  const extension = puntoFinal > 0 ? nombre.slice(puntoFinal + 1) : "";
  const baseLimpia = base.replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 60) || "archivo";
  const extensionLimpia = extension.toLowerCase().replace(/[^a-z0-9]/g, "");
  return extensionLimpia ? `${baseLimpia}.${extensionLimpia}` : baseLimpia;
}

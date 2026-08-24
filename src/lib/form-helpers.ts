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

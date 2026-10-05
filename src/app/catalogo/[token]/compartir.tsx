"use client";

import { useState } from "react";

/** Botones del vendedor para mandar su catálogo (sin precios) a sus
 * clientes: copiar el link, mandarlo por WhatsApp o bajar el PDF. El link
 * completo se arma al momento de picarle (con el dominio real del navegador). */
export function BotonesCompartir({ linkClientes, nombre }: { linkClientes: string; nombre: string }) {
  const [copiado, setCopiado] = useState(false);
  const urlCompleta = () => `${window.location.origin}${linkClientes}`;

  return (
    <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <p className="text-sm font-medium text-emerald-900">Comparte el catálogo con tus clientes</p>
      <p className="mt-0.5 text-xs text-emerald-800">Este link es solo para ellos: muestra los productos sin precios ni cantidades. Tu link privado (este) no lo compartas.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={async () => {
            const url = urlCompleta();
            try {
              await navigator.clipboard.writeText(url);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            } catch {
              window.prompt("Copia el link:", url);
            }
          }}
          className="rounded-lg bg-emerald-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          {copiado ? "¡Link copiado!" : "Copiar link para clientes"}
        </button>
        <button
          type="button"
          onClick={() => {
            const mensaje = `Hola, te comparto el catálogo de productos que manejo (${nombre}): ${urlCompleta()}`;
            window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, "_blank", "noopener");
          }}
          className="rounded-lg border border-emerald-300 bg-white px-3.5 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
        >
          Mandar por WhatsApp
        </button>
        <a href={`${linkClientes}/imprimir`} target="_blank" rel="noreferrer" className="rounded-lg border border-emerald-300 bg-white px-3.5 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100">
          PDF para clientes
        </a>
      </div>
    </div>
  );
}

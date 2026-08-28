"use client";

import { useState } from "react";
import { CampoSugerencias } from "@/components/campo-sugerencias";

const claseCampo =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:ring-zinc-500";

/** Fábrica + Proveedor "principal" de un contenedor, con sugerencias de
 * los que Isaac ya ha usado antes (normalmente se repiten). */
export function CamposProveedorPrincipal({
  fabricas,
  proveedores,
  fabricaInicial,
  proveedorInicial,
}: {
  fabricas: string[];
  proveedores: string[];
  fabricaInicial?: string | null;
  proveedorInicial?: string | null;
}) {
  const [fabrica, setFabrica] = useState(fabricaInicial ?? "");
  const [proveedor, setProveedor] = useState(proveedorInicial ?? "");

  return (
    <div className="mt-2 grid grid-cols-2 gap-4">
      <div>
        <label className="block text-xs font-medium text-zinc-500">Fábrica</label>
        <CampoSugerencias
          name="fabrica_principal"
          value={fabrica}
          onChange={setFabrica}
          sugerencias={fabricas}
          className={claseCampo}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500">Proveedor / contacto</label>
        <CampoSugerencias
          name="proveedor_principal"
          value={proveedor}
          onChange={setProveedor}
          sugerencias={proveedores}
          className={claseCampo}
        />
      </div>
    </div>
  );
}

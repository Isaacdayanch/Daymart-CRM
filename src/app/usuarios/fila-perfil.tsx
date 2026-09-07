"use client";

import { useState } from "react";
import { Selector } from "@/components/selector";
import type { Perfil, Rol } from "@/lib/tipos";
import { formatoFecha } from "@/lib/formato";
import { actualizarRolPerfil, quitarPerfil } from "./actions";

const ROLES: { value: Rol; label: string }[] = [
  { value: "dueno", label: "Dueño" },
  { value: "operadora", label: "Operadora" },
];

export function FilaPerfil({ perfil, esUnoMismo }: { perfil: Perfil; esUnoMismo: boolean }) {
  const [guardando, setGuardando] = useState(false);

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div>
        <p className="text-sm font-medium text-zinc-900">
          {perfil.nombre || "(sin nombre)"} {esUnoMismo && <span className="text-xs text-zinc-400">(tú)</span>}
        </p>
        <p className="text-xs text-zinc-400">Desde {formatoFecha(perfil.creado_en)}</p>
      </div>
      <div className="flex items-center gap-3">
        {esUnoMismo ? (
          <span className="w-36 text-sm text-zinc-500">
            {ROLES.find((r) => r.value === perfil.rol)?.label}
          </span>
        ) : (
          <div className="w-36">
            <Selector
              defaultValue={perfil.rol}
              opciones={ROLES}
              onChange={async (valor) => {
                setGuardando(true);
                await actualizarRolPerfil(perfil.id, valor as Rol);
                setGuardando(false);
              }}
            />
          </div>
        )}
        {!esUnoMismo && (
          <button
            type="button"
            disabled={guardando}
            onClick={() => quitarPerfil(perfil.id)}
            className="text-xs text-zinc-400 hover:text-red-600"
          >
            Quitar acceso
          </button>
        )}
      </div>
    </div>
  );
}

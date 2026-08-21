"use client";

import { useState } from "react";

export function CampoImagen({ name }: { name: string }) {
  const [previa, setPrevia] = useState<string | null>(null);

  return (
    <label className="flex aspect-square w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50 text-center text-xs text-zinc-500 hover:border-zinc-400 hover:bg-zinc-100">
      {previa ? (
        // eslint-disable-next-line @next/next/no-img-element -- previsualización local (blob:), next/image no aplica aquí
        <img src={previa} alt="Foto seleccionada" className="h-full w-full rounded-lg object-cover" />
      ) : (
        <>
          <span className="text-xl">+</span>
          <span>Agrega tu foto aquí</span>
        </>
      )}
      <input
        type="file"
        name={name}
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          setPrevia(archivo ? URL.createObjectURL(archivo) : null);
        }}
      />
    </label>
  );
}

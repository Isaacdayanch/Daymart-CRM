"use client";

import { TIPOS_DOCUMENTO, type DocumentoContenedor, type TipoDocumento } from "@/lib/tipos";
import { subirDocumento, eliminarDocumento } from "./actions";

interface DocumentoConUrl extends DocumentoContenedor {
  url: string | null;
}

export function Documentos({
  contenedorId,
  documentosPorTipo,
}: {
  contenedorId: string;
  documentosPorTipo: Partial<Record<TipoDocumento, DocumentoConUrl>>;
}) {
  const completados = TIPOS_DOCUMENTO.filter((t) => documentosPorTipo[t.valor]).length;
  const total = TIPOS_DOCUMENTO.length;
  const porcentaje = Math.round((completados / total) * 100);
  const completo = completados === total;

  return (
    <details id="documentacion" className="group rounded-xl border border-zinc-200 bg-white p-6">
      <summary className="flex cursor-pointer list-none items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 transition-transform group-open:rotate-90">▶</span>
          <p className="text-sm font-medium text-zinc-700">Documentación</p>
        </div>
        <p className={`text-xs font-medium ${completo ? "text-emerald-600" : "text-zinc-500"}`}>
          {completados} de {total} completo
        </p>
      </summary>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full transition-all ${completo ? "bg-emerald-500" : "bg-zinc-900"}`}
          style={{ width: `${porcentaje}%` }}
        />
      </div>

      <ul className="mt-4 divide-y divide-zinc-100">
        {TIPOS_DOCUMENTO.map((t) => {
          const doc = documentosPorTipo[t.valor];
          const subir = subirDocumento.bind(null, contenedorId, t.valor);

          return (
            <li key={t.valor} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                    doc ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-400"
                  }`}
                >
                  {doc ? "✓" : ""}
                </span>
                <span className="text-sm text-zinc-700">{t.etiqueta}</span>
              </div>

              <div className="flex items-center gap-3">
                {doc?.url && (
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
                  >
                    Ver
                  </a>
                )}
                {doc && (
                  <button
                    type="button"
                    onClick={() => eliminarDocumento(contenedorId, doc.id, doc.ruta_archivo)}
                    className="text-xs text-zinc-400 hover:text-red-600"
                  >
                    Quitar
                  </button>
                )}
                <form action={subir}>
                  <label className="cursor-pointer text-xs font-medium text-zinc-600 hover:text-zinc-900">
                    {doc ? "Reemplazar" : "Subir"}
                    <input
                      type="file"
                      name="archivo"
                      className="hidden"
                      onChange={(e) => e.target.form?.requestSubmit()}
                    />
                  </label>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

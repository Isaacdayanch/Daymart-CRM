/** Pantallas de carga (velocidad, 22 oct; Isaac: "Mercado Libre y Stock son
 * los más lentos"). Sin ellas, al picarle a una sección el navegador se
 * quedaba congelado en la pantalla anterior hasta que el servidor terminaba.
 * Con un `loading.tsx` que las use, la pantalla cambia al instante y se ven
 * bloques grises suaves mientras llegan los números. */

function Bloque({ className = "" }: { className?: string }) {
  return <div className={`rounded-lg bg-zinc-200/70 ${className}`} />;
}

/** El cuerpo de una sección: tarjetas de resumen arriba y una lista abajo.
 * Va dentro del layout de la sección (el encabezado y las pestañas ya se ven). */
export function EsqueletoContenido({ tarjetas = 3, renglones = 6 }: { tarjetas?: number; renglones?: number }) {
  return (
    <div role="status" aria-label="Cargando" className="animate-pulse space-y-8">
      {tarjetas > 0 && (
        <div className={`grid gap-4 ${tarjetas >= 5 ? "sm:grid-cols-5" : tarjetas === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
          {Array.from({ length: tarjetas }, (_, i) => (
            <div key={i} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <Bloque className="h-3 w-24" />
              <Bloque className="mt-3 h-7 w-32" />
              <Bloque className="mt-3 h-3 w-40" />
            </div>
          ))}
        </div>
      )}
      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 p-6">
          <Bloque className="h-4 w-40" />
        </div>
        <ul className="divide-y divide-zinc-100">
          {Array.from({ length: renglones }, (_, i) => (
            <li key={i} className="flex items-center gap-4 px-6 py-4">
              <Bloque className="h-12 w-12 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Bloque className="h-3.5 w-3/5" />
                <Bloque className="h-3 w-2/5" />
              </div>
              <Bloque className="h-4 w-16" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Pantalla completa (encabezado + cuerpo), para cuando se entra a una
 * sección desde otra y todavía no está su encabezado. */
export function EsqueletoPagina() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl animate-pulse items-center justify-between px-4 py-5 sm:px-6">
          <div>
            <Bloque className="h-6 w-32" />
            <Bloque className="mt-2 h-5 w-24" />
          </div>
          <Bloque className="h-9 w-9 rounded-full" />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <EsqueletoContenido />
      </main>
    </div>
  );
}

-- Catálogo para vendedores externos (aprobado por Isaac el 5 oct).
--
-- 1) Descripción de la pieza en la ficha del catálogo: las medidas que ya
--    tenía el sistema son de la CAJA de importación, no del producto en sí.
--    Aquí Isaac escribe el tamaño/descripción de la pieza como la ve el
--    cliente final (texto libre, opcional).
-- 2) Accesos para vendedores: un link secreto por vendedor (sin login) que
--    muestra el catálogo con foto, datos y piezas en bodega — SIN precios ni
--    costos. Se puede cortar un acceso sin afectar a los demás.

alter table productos_catalogo add column if not exists descripcion text;

create table if not exists accesos_catalogo (
  id uuid primary key default gen_random_uuid(),
  -- A quién le diste el link (ej. "Juan — vendedor ML").
  nombre text not null,
  -- La parte secreta del link. Larga y al azar: adivinarla es imposible.
  token text not null unique,
  notas text,
  creado_en timestamptz not null default now(),
  ultimo_acceso_en timestamptz,
  visitas integer not null default 0,
  -- Cortar el acceso = poner fecha aquí; el link deja de funcionar al instante.
  revocado_en timestamptz
);

-- Solo el dueño administra los accesos desde el CRM. La página pública del
-- vendedor NO pasa por aquí: la lee el servidor con la service role key y
-- solo entrega los campos del catálogo (nunca costos ni finanzas).
alter table accesos_catalogo enable row level security;
drop policy if exists "dueno administra accesos catalogo" on accesos_catalogo;
create policy "dueno administra accesos catalogo" on accesos_catalogo
  for all using (es_dueno()) with check (es_dueno());

notify pgrst, 'reload schema';

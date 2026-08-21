-- Guarda cuándo pasó cada contenedor por cada estado (configurándose,
-- en tránsito, recibido en puerto, liberado de aduana, recibido en
-- bodega), para tener el historial de fechas completo.
create table if not exists historial_estados_contenedor (
  id uuid primary key default gen_random_uuid(),
  contenedor_id uuid not null references contenedores(id) on delete cascade,
  estado estado_contenedor not null,
  fecha timestamptz not null default now()
);

create index if not exists historial_estados_contenedor_id_idx
  on historial_estados_contenedor(contenedor_id);

alter table historial_estados_contenedor enable row level security;

drop policy if exists "acceso abierto historial estados" on historial_estados_contenedor;
create policy "acceso abierto historial estados"
  on historial_estados_contenedor for all
  using (true)
  with check (true);

-- Ajustes pedidos por Isaac:
-- - Flete en USD (con su propio tipo de cambio), Aduana en pesos, Mercancía
--   se paga en abonos (cada uno en USD con su propio tipo de cambio) y el
--   sistema calcula el tipo de cambio promedio ponderado.
-- - Se quita el campo "barco" (solo queda booking).
-- - Nuevos estados del contenedor, en el orden real del proceso.

-- Este contenedor de prueba se hizo antes de este cambio de estructura,
-- se borra para poder migrar limpio (no hay datos reales todavía).
truncate table productos, contenedores cascade;

alter table contenedores
  drop column barco,
  drop column mercancia,
  drop column tipo_cambio;

alter table contenedores rename column flete to flete_dolares;
alter table contenedores add column flete_tipo_cambio numeric(6, 3) not null default 0;

alter table contenedores rename column aduana to aduana_pesos;

alter table contenedores alter column estado drop default;
drop type estado_contenedor;
create type estado_contenedor as enum (
  'CONFIGURANDOSE',
  'EN_TRANSITO',
  'RECIBIDO_PUERTO',
  'LIBERADO_ADUANA',
  'RECIBIDO_BODEGA'
);
alter table contenedores
  add column estado_nuevo estado_contenedor not null default 'CONFIGURANDOSE';
alter table contenedores drop column estado;
alter table contenedores rename column estado_nuevo to estado;

create table pagos_mercancia (
  id uuid primary key default gen_random_uuid(),
  contenedor_id uuid not null references contenedores(id) on delete cascade,
  monto_dolares numeric(12, 2) not null default 0,
  tipo_cambio numeric(6, 3) not null default 0,
  pagado boolean not null default false,
  fecha date,
  notas text,
  creado_en timestamptz not null default now()
);

create index pagos_mercancia_contenedor_id_idx on pagos_mercancia(contenedor_id);

alter table pagos_mercancia enable row level security;

create policy "usuarios autenticados leen y escriben pagos de mercancia"
  on pagos_mercancia for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

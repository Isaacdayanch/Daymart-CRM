-- Módulo 1: Pedidos / Contenedores
-- Dos tablas: contenedores (nivel 1) y productos (nivel 2, varios por contenedor).
-- Los campos calculados (cartones, cbm, costo final, etc.) se calculan en la
-- aplicación, no en la base de datos, para que la lógica sea fácil de ajustar
-- cuando Isaac pida cambios.

create type estado_contenedor as enum (
  'EN_TRANSITO',
  'DEPOSIT_PAID',
  'DEPOSIT_PAID_10K_RECEIVED',
  'FULLY_PAID',
  'RECEIVED'
);

create table contenedores (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique,
  barco text,
  booking text,
  estado estado_contenedor not null default 'EN_TRANSITO',
  flete numeric(12, 2) not null default 0,
  aduana numeric(12, 2) not null default 0,
  mercancia numeric(12, 2) not null default 0,
  tipo_cambio numeric(6, 3) not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table productos (
  id uuid primary key default gen_random_uuid(),
  contenedor_id uuid not null references contenedores(id) on delete cascade,
  categoria text not null,
  fabrica text,
  proveedor text,
  imagen_url text,
  sku text not null,
  nombre text not null,
  memo text,
  cantidad integer not null default 0,
  precio_dolares numeric(10, 2) not null default 0,
  piezas_por_caja integer not null default 1,
  largo_cm numeric(8, 2) not null default 0,
  ancho_cm numeric(8, 2) not null default 0,
  alto_cm numeric(8, 2) not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index productos_contenedor_id_idx on productos(contenedor_id);

alter table contenedores enable row level security;
alter table productos enable row level security;

-- Por ahora un solo usuario (Isaac). Cuando haya login se ajusta esta política
-- para restringir por usuario/rol.
create policy "usuarios autenticados leen y escriben contenedores"
  on contenedores for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "usuarios autenticados leen y escriben productos"
  on productos for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

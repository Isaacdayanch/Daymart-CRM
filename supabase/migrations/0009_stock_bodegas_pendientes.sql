-- Módulo 2: Stock/Inventario.
-- Bodegas (empieza con una, pero se pueden agregar más), un libro único de
-- movimientos de stock (entradas/salidas) y la libreta de mercancía que se
-- quedó pendiente en China al recibir un contenedor incompleto.

create table if not exists bodegas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  eliminado_en timestamptz,
  creado_en timestamptz not null default now()
);

insert into bodegas (nombre)
values ('Bodega Principal')
on conflict (nombre) do nothing;

create table if not exists movimientos_stock (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('ENTRADA', 'SALIDA')),
  sku text not null,
  nombre text not null,
  bodega_id uuid not null references bodegas(id),
  cantidad numeric not null check (cantidad > 0),
  costo_unitario_pesos numeric not null default 0,
  contenedor_id uuid references contenedores(id) on delete set null,
  destino text,
  referencia text,
  creado_en timestamptz not null default now()
);

create index if not exists movimientos_stock_sku_idx on movimientos_stock(sku);
create index if not exists movimientos_stock_contenedor_idx on movimientos_stock(contenedor_id);

-- Mercancía que se quedó en China porque no llegó completa a un contenedor:
-- guarda los mismos datos del producto para poder recrearlo después en un
-- contenedor futuro (consolidado o pedido nuevo).
create table if not exists pendientes_china (
  id uuid primary key default gen_random_uuid(),
  contenedor_origen_id uuid references contenedores(id) on delete set null,
  sku text not null,
  nombre text not null,
  categoria text,
  fabrica text,
  proveedor text,
  imagen_url text,
  memo text,
  precio_dolares numeric not null default 0,
  piezas_por_caja numeric not null default 1,
  largo_cm numeric not null default 0,
  ancho_cm numeric not null default 0,
  alto_cm numeric not null default 0,
  cantidad_pendiente numeric not null check (cantidad_pendiente > 0),
  pagado boolean not null default false,
  notas text,
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'ASIGNADA', 'CANCELADA')),
  contenedor_asignado_id uuid references contenedores(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists pendientes_china_estado_idx on pendientes_china(estado);

-- Configuración global de stock: por ahora solo el tiempo de espera (días)
-- que se usa para calcular el punto de reorden. Una sola fila.
create table if not exists configuracion_stock (
  id smallint primary key default 1 check (id = 1),
  dias_espera integer not null default 60
);

insert into configuracion_stock (id, dias_espera)
values (1, 60)
on conflict (id) do nothing;

-- Marca cuándo se generó el stock automático de un contenedor (al
-- recibirlo), para no duplicar entradas si se vuelve a tocar el estado.
alter table contenedores add column if not exists stock_generado_en timestamptz;

alter table bodegas enable row level security;
alter table movimientos_stock enable row level security;
alter table pendientes_china enable row level security;
alter table configuracion_stock enable row level security;

drop policy if exists "acceso abierto bodegas" on bodegas;
create policy "acceso abierto bodegas" on bodegas for all using (true) with check (true);

drop policy if exists "acceso abierto movimientos stock" on movimientos_stock;
create policy "acceso abierto movimientos stock" on movimientos_stock for all using (true) with check (true);

drop policy if exists "acceso abierto pendientes china" on pendientes_china;
create policy "acceso abierto pendientes china" on pendientes_china for all using (true) with check (true);

drop policy if exists "acceso abierto configuracion stock" on configuracion_stock;
create policy "acceso abierto configuracion stock" on configuracion_stock for all using (true) with check (true);

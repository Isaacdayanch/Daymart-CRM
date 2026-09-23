-- Marcas y catálogo de productos (Fase A del plan aprobado el 23 sep).
--
-- Antes, un producto solo "vivía" dentro de cada contenedor (tabla productos)
-- o como renglones sueltos en movimientos_stock. Ahora hay UN registro por
-- SKU en productos_catalogo (marca, línea, categoría, nombre, foto, piezas por
-- caja, medidas): se alimenta de los contenedores y de las altas manuales, y
-- es lo que leen Stock, Mercado Libre y el chat con IA.
--
-- Regla de SKU nueva (Isaac, 23 sep): MARCA-PRODUCTO-VARIANTE, corto, sin
-- categoría ni línea adentro ("en el SKU solo va lo que nunca cambia").

create table if not exists marcas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  -- Código de 3 letras que encabeza el SKU (DAY, MAM…).
  codigo text not null unique check (codigo ~ '^[A-Z0-9]{2,4}$'),
  notas text,
  creado_en timestamptz not null default now(),
  eliminado_en timestamptz
);

insert into marcas (nombre, codigo) values ('Daymart', 'DAY'), ('Mamey', 'MAM')
on conflict (nombre) do nothing;

create table if not exists productos_catalogo (
  sku text primary key,
  nombre text not null,
  marca_id uuid references marcas(id),
  -- Línea de marketing (Flow, Ride…), opcional: sirve para filtrar y
  -- reportes, NUNCA forma parte del SKU.
  linea text,
  categoria text,
  imagen_url text,
  piezas_por_caja numeric not null default 1,
  largo_cm numeric not null default 0,
  ancho_cm numeric not null default 0,
  alto_cm numeric not null default 0,
  memo text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz
);

alter table productos add column if not exists marca_id uuid references marcas(id);

alter table marcas enable row level security;
alter table productos_catalogo enable row level security;
create policy "requiere sesion marcas" on marcas
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "requiere sesion productos catalogo" on productos_catalogo
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Se llena solo con lo que ya existe: primero los productos de contenedor
-- (el más reciente por SKU), luego los SKUs que solo viven en movimientos
-- de stock (altas manuales, carga masiva).
insert into productos_catalogo (sku, nombre, categoria, imagen_url, piezas_por_caja, largo_cm, ancho_cm, alto_cm, memo, creado_en)
select distinct on (sku) sku, nombre, categoria, imagen_url, piezas_por_caja, largo_cm, ancho_cm, alto_cm, memo, creado_en
from productos
order by sku, creado_en desc
on conflict (sku) do nothing;

insert into productos_catalogo (sku, nombre, imagen_url, piezas_por_caja, creado_en)
select distinct on (sku) sku, nombre, imagen_url, coalesce(piezas_por_caja, 1), creado_en
from movimientos_stock
where tipo in ('ENTRADA', 'AJUSTE')
order by sku, creado_en desc
on conflict (sku) do nothing;

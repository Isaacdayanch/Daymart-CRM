-- Planeador de contenedores (Isaac, 26 oct: "estoy configurando el 16 y
-- quiero meterle mucho más de 70 CBM… y luego empezar a asignarlos por
-- contenedor, pasarlos de contenedor con un drag and drop, y crear el 17
-- así, según el peso y la urgencia de cada cosa").

-- A) Urgencia de cada producto del contenedor: Urgente / Normal / Puede
-- esperar. Solo para ordenar y decidir qué se va primero; no toca costos.
alter table productos add column if not exists prioridad text not null default 'NORMAL'
  check (prioridad in ('URGENTE', 'NORMAL', 'PUEDE_ESPERAR'));

-- B) Historial de traslados: cada vez que un producto (o parte de sus
-- piezas) se pasa de un contenedor a otro desde el planeador, queda
-- anotado aquí, para saber de dónde salió cada cosa.
create table if not exists traslados_producto (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid references productos(id) on delete set null,
  sku text not null,
  nombre text not null,
  cantidad integer not null check (cantidad > 0),
  -- true = se movió solo una parte (el producto quedó en los dos contenedores)
  parcial boolean not null default false,
  origen_contenedor_id uuid references contenedores(id) on delete set null,
  destino_contenedor_id uuid references contenedores(id) on delete set null,
  origen_numero integer,
  destino_numero integer,
  creado_en timestamptz not null default now()
);

create index if not exists traslados_producto_origen_idx on traslados_producto(origen_contenedor_id);
create index if not exists traslados_producto_destino_idx on traslados_producto(destino_contenedor_id);

alter table traslados_producto enable row level security;
create policy "requiere sesion traslados producto" on traslados_producto
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

notify pgrst, 'reload schema';

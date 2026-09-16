-- Módulo Ventas: ventas directas a clientes (fuera de Mercado Libre), de
-- contado o a crédito con pagos parciales. Mismos principios del resto del
-- sistema: un solo libro (cobros_venta), el saldo de cada venta NUNCA se
-- guarda a mano (total − suma de sus cobros), y cada cobro genera su
-- ENTRADA real en Finanzas en la misma operación ("una sola captura").
-- La mercancía sale de Stock como movimientos SALIDA ligados a la venta.

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  notas text,
  -- Días de crédito habituales de este cliente: al hacerle una venta a
  -- crédito se propone la fecha límite = fecha de venta + estos días.
  dias_credito integer,
  eliminado_en timestamptz,
  creado_en timestamptz not null default now()
);

create table if not exists ventas (
  id uuid primary key default gen_random_uuid(),
  -- Folio corrido (1, 2, 3...) para la nota de venta.
  numero bigint generated always as identity unique,
  cliente_id uuid not null references clientes(id),
  bodega_id uuid not null references bodegas(id),
  fecha timestamptz not null default now(),
  forma_pago text not null check (forma_pago in ('CONTADO', 'CREDITO')),
  -- true = se le suma 16% de IVA al subtotal (los precios se capturan sin IVA).
  con_iva boolean not null default false,
  -- Solo para ventas a crédito: cuándo debe pagar el cliente.
  fecha_limite timestamptz,
  notas text,
  creado_en timestamptz not null default now()
);

create table if not exists venta_lineas (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references ventas(id) on delete cascade,
  sku text not null,
  nombre text not null,
  imagen_url text,
  cantidad numeric not null check (cantidad > 0),
  precio_unitario numeric not null check (precio_unitario >= 0),
  -- Foto del costo promedio del SKU al momento de vender, para calcular
  -- el margen real de la venta aunque el costo cambie después.
  costo_unitario numeric not null default 0,
  orden integer not null default 0
);

create table if not exists cobros_venta (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references ventas(id) on delete cascade,
  monto numeric not null check (monto > 0),
  fecha timestamptz not null default now(),
  cuenta_id uuid not null references cuentas_financieras(id),
  notas text,
  movimiento_financiero_id uuid references movimientos_financieros(id) on delete set null,
  creado_en timestamptz not null default now()
);

create index if not exists ventas_cliente_idx on ventas(cliente_id);
create index if not exists venta_lineas_venta_idx on venta_lineas(venta_id);
create index if not exists cobros_venta_venta_idx on cobros_venta(venta_id);

-- Cada salida de stock generada por una venta queda ligada a ella.
alter table movimientos_stock add column if not exists venta_id uuid references ventas(id) on delete set null;
create index if not exists movimientos_stock_venta_idx on movimientos_stock(venta_id);

-- Categoría fija de Finanzas para las entradas de dinero por ventas directas.
insert into categorias_financieras (nombre, fija, orden)
values ('Ventas directas', true, 8)
on conflict (nombre) do nothing;

alter table clientes enable row level security;
alter table ventas enable row level security;
alter table venta_lineas enable row level security;
alter table cobros_venta enable row level security;

create policy "requiere sesion clientes" on clientes
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "requiere sesion ventas" on ventas
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "requiere sesion venta lineas" on venta_lineas
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "requiere sesion cobros venta" on cobros_venta
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

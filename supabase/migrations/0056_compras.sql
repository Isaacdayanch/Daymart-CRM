-- 0056 — Compras a proveedores mexicanos (22 oct 2026).
--
-- Isaac: "voy a empezar a comprar de un proveedor mexicano ciertas cosas…
-- no se necesita el CBM; le pongo el costo por pieza y la foto del producto
-- para que se dé de alta en el CRM… que tenga por proveedor sus órdenes de
-- compra, la orden a entregar, etc.". Plan aprobado ("Sí, me gusta"):
-- sección nueva "Compras" con Órdenes de compra, Por recibir y Proveedores.
--
-- Principios (los mismos de todo el sistema):
-- - El precio se captura COMO LO DA EL PROVEEDOR: con IVA incluido (Isaac:
--   "si un producto me cuesta 30 pesos, ya tiene el IVA cargado"). Ese es el
--   costo que entra al stock.
-- - La deuda con el proveedor vive en Finanzas → Facturas (cuentas por
--   pagar): cada orden genera UNA cuenta por pagar (facturas_pendientes con
--   orden_compra_id) al pedirla; los pagos (anticipo, al recibir o a
--   crédito) se registran ahí o desde la orden, con el mismo mecanismo de
--   "una sola captura". Isaac le pone el folio cuando le llega la factura.
-- - La mercancía entra al stock al recibirla (movimientos ENTRADA ligados
--   con orden_compra_id), con el costo por pieza = precio + flete repartido.

create table if not exists proveedores_mx (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  contacto text,
  telefono text,
  correo text,
  rfc text,
  notas text,
  -- Cómo te cobra normalmente: ANTICIPADO (pagas al pedir), AL_RECIBIR, o
  -- CREDITO a N días desde que recibes. Es el valor por defecto de cada
  -- orden nueva; en la orden se puede cambiar.
  condiciones_pago text not null default 'AL_RECIBIR' check (condiciones_pago in ('ANTICIPADO', 'AL_RECIBIR', 'CREDITO')),
  dias_credito integer,
  eliminado_en timestamptz,
  creado_en timestamptz not null default now()
);

create table if not exists ordenes_compra (
  id uuid primary key default gen_random_uuid(),
  -- Folio corrido (1, 2, 3…) para la orden de compra que se le manda al proveedor.
  numero bigint generated always as identity unique,
  proveedor_id uuid not null references proveedores_mx(id),
  -- A qué bodega llega la mercancía (se usa al recibir).
  bodega_id uuid references bodegas(id),
  fecha timestamptz not null default now(),
  -- Cuándo prometió entregar el proveedor.
  fecha_entrega timestamptz,
  estado text not null default 'PEDIDA' check (estado in ('PEDIDA', 'PARCIAL', 'RECIBIDA', 'CANCELADA')),
  condiciones_pago text not null default 'AL_RECIBIR' check (condiciones_pago in ('ANTICIPADO', 'AL_RECIBIR', 'CREDITO')),
  dias_credito integer,
  -- Flete local u otros gastos de esta orden (con IVA incluido); se reparte
  -- entre las piezas en proporción a su valor al calcular el costo del stock.
  flete numeric not null default 0 check (flete >= 0),
  -- Lo que va en la orden para el proveedor (instrucciones de entrega, etc.).
  notas_proveedor text,
  -- Notas internas (no salen en la orden impresa).
  notas text,
  recibida_en timestamptz,
  cancelada_en timestamptz,
  creado_en timestamptz not null default now()
);

create table if not exists orden_compra_lineas (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references ordenes_compra(id) on delete cascade,
  sku text not null,
  nombre text not null,
  imagen_url text,
  piezas_por_caja numeric not null default 1,
  cantidad numeric not null check (cantidad > 0),
  -- Precio por pieza tal cual lo da el proveedor (con IVA incluido).
  precio_unitario numeric not null check (precio_unitario >= 0),
  -- Cuántas piezas han llegado (se suma en cada recepción parcial).
  cantidad_recibida numeric not null default 0 check (cantidad_recibida >= 0),
  orden integer not null default 0
);

create index if not exists ordenes_compra_proveedor_idx on ordenes_compra(proveedor_id);
create index if not exists ordenes_compra_estado_idx on ordenes_compra(estado);
create index if not exists orden_compra_lineas_orden_idx on orden_compra_lineas(orden_id);

-- Cada entrada de stock generada al recibir una orden queda ligada a ella
-- (igual que contenedor_id / venta_id): no se edita suelta en Movimientos.
alter table movimientos_stock add column if not exists orden_compra_id uuid references ordenes_compra(id) on delete set null;
create index if not exists movimientos_stock_orden_compra_idx on movimientos_stock(orden_compra_id);

-- La cuenta por pagar de la orden vive en Finanzas → Facturas; desde ahí se
-- ve "viene de la orden de compra #N" y no se puede quitar suelta.
alter table facturas_pendientes add column if not exists orden_compra_id uuid references ordenes_compra(id) on delete set null;
create unique index if not exists facturas_pendientes_orden_compra_idx on facturas_pendientes(orden_compra_id) where orden_compra_id is not null;

alter table proveedores_mx enable row level security;
alter table ordenes_compra enable row level security;
alter table orden_compra_lineas enable row level security;

-- Solo el dueño: las compras traen costos.
create policy "solo dueno proveedores mx" on proveedores_mx
  for all using (es_dueno()) with check (es_dueno());
create policy "solo dueno ordenes compra" on ordenes_compra
  for all using (es_dueno()) with check (es_dueno());
create policy "solo dueno orden compra lineas" on orden_compra_lineas
  for all using (es_dueno()) with check (es_dueno());

comment on column ordenes_compra.flete is 'Flete local u otros gastos de la orden (con IVA incluido); se reparte entre las piezas al recibir.';
comment on column orden_compra_lineas.precio_unitario is 'Precio por pieza como lo da el proveedor, con IVA incluido. Es el costo que entra al stock (más el flete repartido).';

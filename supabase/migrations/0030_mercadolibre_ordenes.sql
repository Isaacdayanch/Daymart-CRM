-- Ventas de Mercado Libre (Fase 1 del Módulo 5): copia local de las órdenes
-- de la cuenta de Isaac, jaladas por la API. Se sincroniza a mano (botón)
-- y también con los avisos que Mercado Libre manda al webhook.
-- Las fechas se guardan como timestamptz (instante exacto, con la zona que
-- trae Mercado Libre) y SIEMPRE se muestran en horario de Ciudad de México.
-- RLS sin políticas: solo el servidor (service role) las lee, y la pantalla
-- es solo para el dueño.

create table if not exists mercadolibre_ordenes (
  id bigint primary key,
  pack_id bigint,
  estado text,
  estado_detalle text,
  fecha_creacion timestamptz not null,
  fecha_cierre timestamptz,
  ultima_actualizacion timestamptz,
  comprador_id bigint,
  comprador_nickname text,
  comprador_nombre text,
  total numeric not null default 0,
  monto_pagado numeric not null default 0,
  moneda text,
  -- Suma de la comisión de Mercado Libre de todos los productos de la orden.
  comision numeric not null default 0,
  envio_id bigint,
  logistica text,
  envio_estado text,
  -- Lo que Mercado Libre le cobra a Isaac por el envío (null = todavía no se consulta).
  costo_envio_vendedor numeric,
  etiquetas text[],
  payload jsonb,
  sincronizado_en timestamptz not null default now()
);

create index if not exists mercadolibre_ordenes_fecha_idx on mercadolibre_ordenes(fecha_creacion desc);

create table if not exists mercadolibre_orden_items (
  id uuid primary key default gen_random_uuid(),
  orden_id bigint not null references mercadolibre_ordenes(id) on delete cascade,
  item_id text,
  variation_id bigint,
  titulo text,
  seller_sku text,
  categoria_id text,
  cantidad numeric not null default 0,
  precio_unitario numeric not null default 0,
  sale_fee numeric not null default 0,
  listing_type text,
  imagen_url text
);

create index if not exists mercadolibre_orden_items_orden_idx on mercadolibre_orden_items(orden_id);

create table if not exists mercadolibre_sync (
  id integer primary key default 1 check (id = 1),
  ultima_sync timestamptz,
  ultimo_error text,
  ordenes_total integer not null default 0
);

alter table mercadolibre_ordenes enable row level security;
alter table mercadolibre_orden_items enable row level security;
alter table mercadolibre_sync enable row level security;
-- Sin políticas a propósito: solo la service role key (servidor).

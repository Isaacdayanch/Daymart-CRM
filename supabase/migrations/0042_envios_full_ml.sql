-- Envíos a Full leídos DIRECTO de Mercado Libre (Isaac, 1 oct: "jala cada
-- producto que llega a Full desde el panel de gestión de envíos; cuando ML
-- lo marque recibido, aviso y yo confirmo para que se descuente de bodega").
-- Copia local de los envíos (inbound) y sus productos; RLS sin políticas:
-- solo el servidor (service role) la lee.

create table if not exists mercadolibre_envios_full (
  inbound_id text primary key,
  -- estado normalizado: PLANEADO | COLECTADO | RECIBIDO | CONTADO | CANCELADO | DESCONOCIDO
  estado text not null default 'DESCONOCIDO',
  -- estado tal cual lo manda Mercado Libre
  estado_ml text,
  fecha_creacion timestamptz,
  fecha_recepcion timestamptz,
  piezas_planeadas numeric,
  piezas_recibidas numeric not null default 0,
  -- de dónde salió la información: 'operaciones' (recepciones de stock) o 'inbound' (API de envíos)
  origen text,
  crudo jsonb,
  -- Isaac ya confirmó la salida de bodega de este envío
  confirmado_en timestamptz,
  -- Isaac dijo que este envío no salió de su bodega (ej. devolución a Full)
  ignorado_en timestamptz,
  actualizado_en timestamptz not null default now()
);

create table if not exists mercadolibre_envios_full_lineas (
  id uuid primary key default gen_random_uuid(),
  inbound_id text not null references mercadolibre_envios_full(inbound_id) on delete cascade,
  -- id de la operación de recepción en ML (para no duplicar); 'plan:<inbound>:<inventario>' si viene del plan
  operacion_id text not null unique,
  inventory_id text,
  item_id text,
  variation_id bigint,
  titulo text,
  seller_sku text,
  imagen_url text,
  cantidad_planeada numeric,
  cantidad_recibida numeric not null default 0,
  fecha timestamptz,
  crudo jsonb,
  creado_en timestamptz not null default now()
);
create index if not exists mercadolibre_envios_full_lineas_inbound_idx on mercadolibre_envios_full_lineas(inbound_id);

-- Cada salida de bodega generada al confirmar queda ligada a su envío de ML.
alter table movimientos_stock add column if not exists inbound_ml_id text;

alter table mercadolibre_sync add column if not exists ultima_sync_envios_full timestamptz;
alter table mercadolibre_sync add column if not exists ultimo_error_envios_full text;
-- qué camino de la API de ML funcionó (se descubre en la primera prueba real)
alter table mercadolibre_sync add column if not exists endpoint_envios_full text;

alter table mercadolibre_envios_full enable row level security;
alter table mercadolibre_envios_full_lineas enable row level security;

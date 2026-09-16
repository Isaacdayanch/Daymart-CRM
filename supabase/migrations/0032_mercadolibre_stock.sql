-- Stock en Mercado Libre (Fase 2 del Módulo 5): copia local de las
-- publicaciones de Isaac (cada variante es un renglón) con su stock en Full,
-- y la liga entre cada publicación y el producto (SKU) del CRM.
-- RLS sin políticas: solo el servidor (service role) las lee.

create table if not exists mercadolibre_publicaciones (
  id uuid primary key default gen_random_uuid(),
  item_id text not null,
  variation_id bigint,
  titulo text,
  variacion text,
  imagen_url text,
  precio numeric,
  estado text,
  logistica text,
  seller_sku text,
  -- true = publicación de catálogo (comparte stock con su publicación tradicional)
  catalogo boolean not null default false,
  -- publicación con la que comparte stock (tradicional <-> catálogo)
  relacion_item_id text,
  -- inventario en Full; dos publicaciones con el MISMO inventory_id comparten stock
  inventory_id text,
  cantidad_publicada numeric,
  full_disponible numeric,
  full_no_disponible numeric,
  full_detalle jsonb,
  actualizado_en timestamptz not null default now()
);

create unique index if not exists mercadolibre_publicaciones_item_var_idx
  on mercadolibre_publicaciones(item_id, coalesce(variation_id, 0));

-- Liga publicación (+variante) -> SKU del CRM. Se guarda aparte para que
-- sobreviva a cada re-sincronización de publicaciones.
create table if not exists mercadolibre_vinculos (
  id uuid primary key default gen_random_uuid(),
  item_id text not null,
  variation_id bigint,
  sku_crm text not null,
  creado_en timestamptz not null default now()
);

create unique index if not exists mercadolibre_vinculos_item_var_idx
  on mercadolibre_vinculos(item_id, coalesce(variation_id, 0));

alter table mercadolibre_sync add column if not exists ultima_sync_stock timestamptz;
alter table mercadolibre_sync add column if not exists ultimo_error_stock text;

alter table mercadolibre_publicaciones enable row level security;
alter table mercadolibre_vinculos enable row level security;

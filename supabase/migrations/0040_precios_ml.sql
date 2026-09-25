-- Precios con margen real y resumen del día en Mercado Libre.
-- 1) A cada publicación se le guarda su categoría, tipo de publicación
--    (Clásica/Premium), precio original (si trae descuento) y la comisión
--    que cobra Mercado Libre a su precio actual (% y parte fija), para
--    calcular el margen sin volver a llamar a ML en cada pantalla.
alter table mercadolibre_publicaciones add column if not exists categoria_id text;
alter table mercadolibre_publicaciones add column if not exists tipo_publicacion text;
alter table mercadolibre_publicaciones add column if not exists precio_original numeric;
alter table mercadolibre_publicaciones add column if not exists comision_pct numeric;
alter table mercadolibre_publicaciones add column if not exists comision_fija numeric;

-- 2) Margen mínimo (%) que Isaac no quiere perforar al cambiar precios.
alter table mercadolibre_sync add column if not exists margen_minimo_pct numeric not null default 20;

-- 3) Bitácora de cada cambio de precio hecho desde el CRM (con "deshacer").
create table if not exists mercadolibre_cambios_precio (
  id uuid primary key default gen_random_uuid(),
  item_id text not null,
  variation_id bigint,
  titulo text,
  precio_anterior numeric,
  precio_nuevo numeric not null,
  -- cómo se calculó: FIJO | PORCENTAJE | MARGEN
  modo text,
  margen_estimado_pct numeric,
  resultado text not null default 'OK', -- OK | ERROR
  error text,
  creado_en timestamptz not null default now(),
  deshecho_en timestamptz
);
create index if not exists mercadolibre_cambios_precio_creado_idx on mercadolibre_cambios_precio(creado_en desc);
-- RLS sin políticas: solo el servidor (service role) la usa.
alter table mercadolibre_cambios_precio enable row level security;

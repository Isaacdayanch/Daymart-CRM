-- Los cambios de precio en Mercado Libre se hacen SOLO como promociones
-- (descuento del vendedor o campañas de ML): el precio base de la
-- publicación no se toca. La bitácora guarda qué promoción se aplicó/quitó.
alter table mercadolibre_cambios_precio add column if not exists accion text not null default 'APLICAR'; -- APLICAR | QUITAR
alter table mercadolibre_cambios_precio add column if not exists promocion_tipo text;   -- PRICE_DISCOUNT | DEAL | LIGHTNING | MARKETPLACE_CAMPAIGN | SMART | ...
alter table mercadolibre_cambios_precio add column if not exists promocion_id text;
alter table mercadolibre_cambios_precio add column if not exists fin_promocion timestamptz;

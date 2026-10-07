-- Liga por SKU de Mercado Libre (7 oct; Isaac: "lo administramos todo sobre
-- ese SKU"). Cada SKU que Isaac pone en sus publicaciones de ML se liga UNA
-- vez a un producto del CRM y aplica a todas las publicaciones con ese SKU.
alter table mercadolibre_vinculos add column if not exists piezas_por_unidad integer not null default 1;

create table if not exists mercadolibre_sku_vinculos (
  seller_sku text primary key,
  sku_crm text not null,
  piezas_por_unidad integer not null default 1 check (piezas_por_unidad >= 1),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table mercadolibre_sku_vinculos enable row level security;

-- Semilla: las ligas por publicación que ya existen, cuando la publicación
-- trae SKU en ML, pasan a ser ligas por SKU (una por SKU, la primera).
insert into mercadolibre_sku_vinculos (seller_sku, sku_crm, piezas_por_unidad)
select distinct on (upper(trim(p.seller_sku))) upper(trim(p.seller_sku)), v.sku_crm, coalesce(v.piezas_por_unidad, 1)
from mercadolibre_vinculos v
join mercadolibre_publicaciones p
  on p.item_id = v.item_id and coalesce(p.variation_id, 0) = coalesce(v.variation_id, 0)
where p.seller_sku is not null and trim(p.seller_sku) <> ''
order by upper(trim(p.seller_sku)), v.creado_en
on conflict (seller_sku) do nothing;

notify pgrst, 'reload schema';

-- 0055 — Liga por Código ML (21 oct 2026).
--
-- Isaac: "no me gusta cómo se liga… no es constante ni consistente". En Full,
-- cada producto físico tiene su Código ML (inventory_id, tipo IPYX23014): es
-- el que sale en el panel de envíos, el que ML escanea y el de las etiquetas.
-- La publicación normal y la de catálogo comparten el mismo código; cada
-- color de una publicación tiene el suyo. Por eso la liga vive aquí: un
-- Código ML = un producto del CRM, y todo el sistema la usa primero.

create table if not exists mercadolibre_codigo_vinculos (
  inventory_id text primary key,
  sku_crm text not null,
  piezas_por_unidad integer not null default 1 check (piezas_por_unidad >= 1),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table mercadolibre_codigo_vinculos enable row level security;

-- Semilla: cada Código ML toma la liga que ya resolvían sus publicaciones
-- (liga de la publicación/variante → liga por SKU de ML → SKU igual a uno del
-- CRM). Si las publicaciones de un mismo código caían en productos
-- DISTINTOS, no se adivina: queda sin liga y el CRM lo muestra como
-- "contradicción" para que Isaac decida.
with pubs as (
  select p.inventory_id, p.item_id, p.variation_id, upper(trim(p.seller_sku)) as sku_ml,
         exists (select 1 from mercadolibre_publicaciones x where x.item_id = p.item_id and x.variation_id is not null) as con_variantes
  from mercadolibre_publicaciones p
  where p.inventory_id is not null and trim(p.inventory_id) <> ''
),
skus_crm as (
  select sku from productos_catalogo where eliminado_en is null
  union
  select distinct sku from movimientos_stock
),
resueltas as (
  select pubs.inventory_id,
    coalesce(
      vp.sku_crm,
      case when not pubs.con_variantes then vi.sku_crm end,
      vs.sku_crm,
      (select s.sku from skus_crm s where upper(s.sku) = pubs.sku_ml limit 1)
    ) as sku_crm,
    coalesce(vp.piezas_por_unidad, case when not pubs.con_variantes then vi.piezas_por_unidad end, vs.piezas_por_unidad, 1) as piezas
  from pubs
  left join mercadolibre_vinculos vp on vp.item_id = pubs.item_id and coalesce(vp.variation_id, 0) = coalesce(pubs.variation_id, 0)
  left join mercadolibre_vinculos vi on vi.item_id = pubs.item_id and vi.variation_id is null and pubs.variation_id is not null
  left join mercadolibre_sku_vinculos vs on upper(trim(vs.seller_sku)) = pubs.sku_ml
),
unicas as (
  select inventory_id, min(sku_crm) as sku_crm, max(piezas) as piezas
  from resueltas
  where sku_crm is not null
  group by inventory_id
  having count(distinct sku_crm) = 1 and count(distinct piezas) = 1
)
insert into mercadolibre_codigo_vinculos (inventory_id, sku_crm, piezas_por_unidad)
select inventory_id, sku_crm, piezas from unicas
on conflict (inventory_id) do nothing;

notify pgrst, 'reload schema';

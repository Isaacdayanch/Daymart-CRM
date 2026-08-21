-- Orden manual de los productos dentro de un contenedor (para poder
-- subirlos/bajarlos en la lista).
alter table productos add column if not exists orden integer not null default 0;

-- A los productos que ya existen les asigna un orden según cuándo se
-- crearon, para que no queden todos en 0.
with numerados as (
  select id, row_number() over (partition by contenedor_id order by creado_en) as n
  from productos
)
update productos
set orden = numerados.n
from numerados
where productos.id = numerados.id;

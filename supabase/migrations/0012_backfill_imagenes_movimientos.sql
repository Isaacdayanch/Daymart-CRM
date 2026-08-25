-- Los movimientos de stock creados ANTES de la migración 0011 (foto en
-- movimientos_stock) se quedaron con imagen_url en blanco, aunque el
-- producto sí tenía foto — por eso no se veían en /stock. Esto rellena esa
-- foto usando el producto real del contenedor (mismo sku + contenedor_id).
update movimientos_stock ms
set imagen_url = p.imagen_url
from productos p
where ms.imagen_url is null
  and ms.contenedor_id = p.contenedor_id
  and ms.sku = p.sku
  and p.imagen_url is not null;

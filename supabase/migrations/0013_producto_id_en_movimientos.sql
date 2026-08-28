-- Guarda de qué producto salió cada movimiento de ENTRADA/AJUSTE ligado a un
-- contenedor. Antes solo se guardaba el SKU, y si Isaac editaba el SKU de
-- un producto DESPUÉS de recibir el contenedor, "Recalcular costo" ya no
-- encontraba el movimiento correcto (buscaba por el SKU nuevo, pero el
-- movimiento se había guardado con el SKU viejo) y no actualizaba nada,
-- sin avisar del error.
alter table movimientos_stock add column if not exists producto_id uuid references productos(id) on delete set null;

create index if not exists movimientos_stock_producto_id_idx on movimientos_stock(producto_id);

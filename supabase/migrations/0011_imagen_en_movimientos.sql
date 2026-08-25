-- Guarda la foto del producto en cada movimiento (igual que piezas_por_caja),
-- para poder mostrar la imagen en el listado de Stock y en la hoja imprimible.
alter table movimientos_stock add column if not exists imagen_url text;

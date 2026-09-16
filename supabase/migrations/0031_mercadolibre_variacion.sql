-- Variante del producto en cada renglón de orden (ej. "Color: Negro · Talla: M")
-- para consolidar ventas por producto+variante, y la comisión ya verificada
-- de ese renglón (ver comisionRenglon en mercadolibre-ordenes.ts).
alter table mercadolibre_orden_items add column if not exists variacion text;
alter table mercadolibre_orden_items add column if not exists comision numeric;

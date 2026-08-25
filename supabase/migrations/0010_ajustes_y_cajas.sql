-- Piezas por caja de cada movimiento (para poder mostrar "cuántas cajas
-- hay" en el resumen de stock, no solo piezas sueltas).
alter table movimientos_stock add column if not exists piezas_por_caja numeric not null default 1;

-- Nuevo tipo de movimiento: AJUSTE. Se usa cuando Isaac edita una recepción
-- ya confirmada (hace un conteo físico y corrige). A diferencia de
-- ENTRADA/SALIDA, la cantidad de un AJUSTE puede ser negativa (resta) o
-- positiva (suma) — y a propósito NO cuenta como "SALIDA" para no ensuciar
-- el cálculo de rotación/reorden con correcciones de conteo.
alter table movimientos_stock drop constraint if exists movimientos_stock_tipo_check;
alter table movimientos_stock add constraint movimientos_stock_tipo_check
  check (tipo in ('ENTRADA', 'SALIDA', 'AJUSTE'));

alter table movimientos_stock drop constraint if exists movimientos_stock_cantidad_check;
alter table movimientos_stock add constraint movimientos_stock_cantidad_check
  check ((tipo = 'AJUSTE' and cantidad <> 0) or (tipo <> 'AJUSTE' and cantidad > 0));

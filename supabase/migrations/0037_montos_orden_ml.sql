-- Montos reales del cobro de cada orden de Mercado Libre (lo que de verdad
-- pagó el comprador y lo que Mercado Pago descuenta), para que "Total
-- vendido / Comisión / Te queda" cuadren con el "Detalle de cobro" de ML.
-- Caso real (20 sep): el comprador pagó $184.37, ML se quedó $27.66 de
-- comisión (15%) + $40 de envío y a Isaac le llegaron $116.71 — pero la
-- orden reportaba total_amount = 116.71 y sale_fee = 0, así que el sistema
-- mostraba "Total vendido $117, comisión $0, te queda $77".
alter table mercadolibre_ordenes add column if not exists pagado_comprador numeric;
alter table mercadolibre_ordenes add column if not exists envio_comprador numeric;
alter table mercadolibre_ordenes add column if not exists comision_mp numeric;
-- Cuándo se revisaron estos montos (también para las órdenes ya guardadas,
-- que se completan desde su `payload` sin volver a llamar a Mercado Libre).
alter table mercadolibre_ordenes add column if not exists montos_revisado_en timestamptz;
create index if not exists mercadolibre_ordenes_montos_idx on mercadolibre_ordenes (montos_revisado_en) where montos_revisado_en is null;

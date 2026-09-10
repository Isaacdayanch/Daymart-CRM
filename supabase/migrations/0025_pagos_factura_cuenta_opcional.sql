-- Permite que un pago de factura quede "sin cuenta" — para pagos que ya
-- habían pasado ANTES de usar el sistema (ej. el pago de $200,000 a la
-- factura de Optiker que salió de BBVA antes del saldo inicial): se
-- guarda el abono para llevar el saldo de la factura, pero sin que reste
-- de ninguna cuenta real (esa salida ya pasó, contarla de nuevo dejaría
-- el saldo de BBVA mal).

alter table pagos_factura alter column cuenta_id drop not null;

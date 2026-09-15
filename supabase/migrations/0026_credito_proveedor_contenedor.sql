-- Crédito del proveedor chino por contenedor (caso real del contenedor 15:
-- adelanto pagado, el resto se paga N días después de que sale de China).
--
-- 1. contenedores.credito_dias: cuántos días de crédito da el proveedor
--    (ej. 60), contados desde la fecha en que el contenedor pasa a
--    "En tránsito". Opcional — solo se llena cuando hay crédito.
-- 2. pagos_mercancia.fecha_limite: la fecha en que vence un abono que
--    sigue "Pendiente" (fecha de salida + credito_dias). Editable a mano.
-- 3. pagos_mercancia.cargo_deuda_id: el cargo que ese abono pendiente
--    generó automáticamente en Finanzas → Proveedores (para que aparezca
--    en "Debes" y en el aviso de vencimiento). Ligado desde el abono, no al
--    revés, igual que movimiento_financiero_id — si se borra el abono, se
--    borra su cargo; nunca quedan dos registros sueltos.

alter table contenedores add column if not exists credito_dias integer;

alter table pagos_mercancia add column if not exists fecha_limite timestamptz;
alter table pagos_mercancia add column if not exists cargo_deuda_id uuid references movimientos_deuda_proveedor(id) on delete set null;

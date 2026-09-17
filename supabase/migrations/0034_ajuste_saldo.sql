-- Estado de cuenta por cuenta (Finanzas → Cuentas → clic en una cuenta).
-- Categoría fija "Ajuste de saldo": para emparejar el saldo del sistema con
-- el del banco sin inventar un gasto. La usa el botón "Ajustar saldo" y la
-- opción "Ajuste" al editar un movimiento. El código la crea solo si falta.
insert into categorias_financieras (nombre, fija, orden)
values ('Ajuste de saldo', true, 99)
on conflict (nombre) do nothing;

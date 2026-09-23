-- Histórico de antes del sistema (Fase B): al dar de alta un producto con
-- "stock inicial" Isaac captura cuántas piezas han entrado y salido en
-- total (de su Google Sheets). Se guardan como una ENTRADA y una SALIDA
-- marcadas historico = true: el stock actual queda bien y la ficha muestra
-- ese pasado, pero esas salidas NO cuentan para la rotación/reorden.
alter table movimientos_stock add column if not exists historico boolean not null default false;

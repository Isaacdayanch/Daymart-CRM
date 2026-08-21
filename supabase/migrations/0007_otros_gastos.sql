-- Gasto opcional para cosas como fletes internos en China u otros
-- cargos que no siempre aplican. En dólares, con su propio tipo de
-- cambio, y se reparte por CBM igual que flete y aduana.
alter table contenedores add column if not exists otros_gastos_dolares numeric(12, 2) not null default 0;
alter table contenedores add column if not exists otros_gastos_tipo_cambio numeric(6, 3) not null default 0;

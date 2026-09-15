-- Mientras un contenedor se configura, Isaac todavía no sabe el flete ni la
-- aduana reales — pone una estimación para poder fijar precios desde ya.
-- Estas banderas marcan qué monto es estimado, para que el contenedor lo
-- muestre en ámbar y no se confunda con la factura real cuando llegue.

alter table contenedores add column if not exists flete_estimado boolean not null default false;
alter table contenedores add column if not exists aduana_estimada boolean not null default false;
alter table contenedores add column if not exists otros_gastos_estimado boolean not null default false;

-- A veces lo que se pagó de mercancía (abonos) no cuadra exacto con lo que
-- suman los precios capturados por producto (ajustes de precio, cargos del
-- banco, fletes internos en China, etc.). En vez de dejar esa diferencia
-- como un misterio, Isaac puede explicarla con un monto + una nota, y la
-- reconciliación del contenedor la da por explicada.
alter table contenedores add column if not exists ajuste_diferencia_pesos numeric not null default 0;
alter table contenedores add column if not exists ajuste_diferencia_nota text;

notify pgrst, 'reload schema';

-- Fecha estimada de llegada del contenedor (Isaac, 14 oct: "ponerle la fecha
-- estimada de llegada para que me mande un aviso y yo esté al pendiente").
-- Se captura en Nuevo/Editar y al marcar "En tránsito"; el aviso sale en
-- Contenedores y en el inicio cuando faltan 7 días o menos (o ya pasó).
alter table contenedores add column if not exists fecha_estimada_llegada date;

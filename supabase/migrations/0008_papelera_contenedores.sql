-- En vez de borrar un contenedor de una vez, se manda a una "papelera"
-- (se marca con fecha de eliminado y se oculta de la lista principal).
-- Se puede restaurar o borrar definitivo desde ahí, sin límite de tiempo.
alter table contenedores add column if not exists eliminado_en timestamptz;

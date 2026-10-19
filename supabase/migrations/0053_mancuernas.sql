-- 0053 — Mancuernas: productos que se compran por peso (19 oct 2026).
--
-- Isaac: "necesito un sistema para traer mancuernas: a veces vienen en
-- libras, a veces en kilos (con el convertidor), a veces en pares y a veces
-- sueltas, según cuántas vienen por caja… que no estorbe a la hora de crear
-- el contenedor".
--
-- Regla: en la base de datos TODO sigue en piezas sueltas (cantidad,
-- piezas_por_caja, precio_dolares por pieza, peso_kg por pieza), que es como
-- Isaac cuenta en bodega. Estas columnas guardan cómo lo capturó él (peso de
-- cada mancuerna y su unidad, si el proveedor la vende por par, cómo venía
-- el precio) para mostrarlo claro y para poder editarlo tal cual.

alter table productos add column if not exists es_mancuerna boolean not null default false;
alter table productos add column if not exists peso_unidad numeric;
alter table productos add column if not exists unidad_peso text;
alter table productos add column if not exists vendida_en_par boolean not null default false;
alter table productos add column if not exists precio_modo text;
alter table productos add column if not exists precio_capturado numeric;

alter table productos_catalogo add column if not exists es_mancuerna boolean not null default false;
alter table productos_catalogo add column if not exists peso_unidad numeric;
alter table productos_catalogo add column if not exists unidad_peso text;
alter table productos_catalogo add column if not exists vendida_en_par boolean not null default false;
alter table productos_catalogo add column if not exists precio_modo text;
alter table productos_catalogo add column if not exists precio_capturado numeric;

comment on column productos.es_mancuerna is 'true = mancuerna / producto que se compra por peso (se captura con peso por pieza en lb o kg, por par o suelta).';
comment on column productos.peso_unidad is 'Peso de CADA mancuerna en la unidad de unidad_peso (ej. 15 lb). peso_kg se calcula de aquí.';
comment on column productos.unidad_peso is 'LB o KG.';
comment on column productos.vendida_en_par is 'true = el proveedor la vende/cuenta por par (cantidad y piezas por caja se capturan en pares; en la base se guardan en piezas sueltas).';
comment on column productos.precio_modo is 'Cómo venía el precio del proveedor: PIEZA, PAR, KG o LB. precio_dolares siempre es por pieza suelta.';
comment on column productos.precio_capturado is 'El precio tal cual lo dio el proveedor, en la unidad de precio_modo.';

-- 0052 — Costo estimado mientras el contenedor se configura (18 oct 2026).
--
-- Isaac: "no puedo ver el costo de los productos hasta no terminar de
-- configurar el contenedor… al cargar un producto que me dé una idea del
-- costo, y al final un botón 'terminar de configurar' donde se reprorratee
-- exacto".
--
-- Mientras el contenedor está "Configurándose" y no se ha marcado como
-- terminado, el flete y la aduana se reparten como si el contenedor fuera
-- lleno (capacidad_cbm, 68 m³ por defecto) en vez de entre los pocos m³ que
-- lleva cargados, y si todavía no hay abonos de mercancía se usa un tipo de
-- cambio estimado. Al dar "Terminar de configurar" (o al pasar a En
-- tránsito) el costo se reparte entre los m³ reales.

alter table contenedores add column if not exists tipo_cambio_estimado numeric;
alter table contenedores add column if not exists configuracion_terminada_en timestamptz;

comment on column contenedores.tipo_cambio_estimado is 'Tipo de cambio para calcular el costo por pieza mientras no hay abonos de mercancía (solo estimación).';
comment on column contenedores.configuracion_terminada_en is 'Isaac marcó que ya terminó de cargar productos: el flete/aduana se reparte entre los m³ reales, no entre la capacidad. Null = sigue configurando.';

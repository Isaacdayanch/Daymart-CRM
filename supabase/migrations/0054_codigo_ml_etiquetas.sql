-- 0054 — Código ML para etiquetas de producto (19 oct 2026).
--
-- Isaac: "cada producto con su etiqueta: SKU, nombre y el código de barras
-- del código de Mercado Libre; si está ligado a ML que lo jale solo, si no yo
-- te lo doy; a la hora de crear el contenedor ponme la opción de agregar el
-- código ML, y si no, la etiqueta sale sin código de barras". El código que
-- se imprime es el "Código ML" de Full (inventory_id, tipo IBHA96856), que es
-- el que Mercado Libre escanea al recibir envíos a Full.
--
-- Si el producto está ligado a Mercado Libre, el código se toma solo de la
-- publicación (no hace falta capturarlo). Estas columnas guardan el que
-- Isaac escribe a mano cuando todavía no hay liga (o para forzar uno).

alter table productos add column if not exists codigo_ml text;
alter table productos_catalogo add column if not exists codigo_ml text;

comment on column productos.codigo_ml is 'Código ML de Full (inventory_id) capturado a mano para la etiqueta; null = se toma de la liga con Mercado Libre.';
comment on column productos_catalogo.codigo_ml is 'Código ML de Full (inventory_id) capturado a mano para la etiqueta; null = se toma de la liga con Mercado Libre.';

-- Peso en contenedores + piezas del CRM por unidad de Mercado Libre
-- (Isaac, 6 oct: mancuernas de Mamey — el peso limita antes que el espacio,
-- y un "par" en Full son 2 piezas en bodega).

-- A) Peso por pieza (kg) en el producto del contenedor y en la ficha del catálogo.
alter table productos add column if not exists peso_kg numeric;
alter table productos_catalogo add column if not exists peso_kg numeric;

-- Límite de peso de carga por contenedor (kg). 21,000 = carga neta máxima
-- de un 40' en carretera en México (NOM-012); 23,000 con sobrecargo, 26,000
-- por tren. Capacidad útil en m³ (40' alto ≈ 68).
alter table contenedores add column if not exists limite_peso_kg numeric not null default 21000;
alter table contenedores add column if not exists capacidad_cbm numeric not null default 68;

-- B) Cuántas piezas del CRM son UNA unidad de la publicación de ML
-- (1 por defecto; 2 para un par de mancuernas).
alter table mercadolibre_vinculos add column if not exists piezas_por_unidad integer not null default 1 check (piezas_por_unidad >= 1);

notify pgrst, 'reload schema';

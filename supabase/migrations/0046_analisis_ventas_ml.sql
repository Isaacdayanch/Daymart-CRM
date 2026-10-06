-- Análisis de venta en Mercado Libre (Isaac, 6 oct: "tomar una foto a la
-- publicación cada rato y analizar el tiempo que estuvo activa y las ventas
-- que tuvo mientras estuvo activa; así sé cuánto vende por día y cuánto
-- pedir").
--
-- Cada sincronización de publicaciones (el reloj, cada hora) anota el estado
-- de cada publicación. Para no guardar miles de renglones iguales, se guarda
-- UN renglón por "tramo": mientras la publicación siga igual (activa / con
-- stock), solo se alarga `hasta`; cuando cambia, se cierra el tramo
-- (`abierto = false`) y se abre otro. Así los tramos son exactos y pocos.
create table if not exists mercadolibre_publicaciones_historial (
  id uuid primary key default gen_random_uuid(),
  item_id text not null,
  variation_id bigint,
  inventory_id text,
  -- Estado del tramo.
  activa boolean not null,
  con_stock boolean not null,
  disponibles integer,
  precio numeric,
  -- Vigencia del tramo: desde la primera foto con este estado hasta la última.
  desde timestamptz not null,
  hasta timestamptz not null,
  -- true = es el tramo vigente de esa publicación (el que se sigue alargando).
  abierto boolean not null default true
);

create index if not exists mlpub_hist_pub_idx on mercadolibre_publicaciones_historial(item_id, coalesce(variation_id, 0), abierto);
create index if not exists mlpub_hist_rango_idx on mercadolibre_publicaciones_historial(hasta, "desde");

-- Solo el servidor (service role key), igual que el resto de las tablas de ML.
alter table mercadolibre_publicaciones_historial enable row level security;

notify pgrst, 'reload schema';

-- "Olvidar este producto" en Ligar SKUs (Isaac, 9 oct: "hay cosas que me
-- aparecen que no me interesa ligar, que ahorita no tengo ni stock ni sé si
-- puedo restockear"). Un SKU de ML (o una publicación sin SKU) marcado aquí
-- deja de aparecer como pendiente; se puede "volver a mostrar" cuando sea.
-- RLS sin políticas: solo el servidor (service role) la lee.

create table if not exists mercadolibre_ligas_ignoradas (
  -- misma clave que usan las ligas: 'sku:<SKU>|0' para un SKU de ML, '<item_id>|<variation_id>' para una publicación
  clave text primary key,
  seller_sku text,
  item_id text,
  variation_id bigint,
  titulo text,
  creado_en timestamptz not null default now()
);

alter table mercadolibre_ligas_ignoradas enable row level security;

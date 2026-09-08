-- Módulo Research: investigación de productos antes de traerlos. Isaac
-- pega un link de Mercado Libre, el sistema jala foto/precio/categoría/
-- ventas solo, y él llena lo que solo él sabe (costo, medidas, envío) para
-- ver el margen estimado antes de decidir si vale la pena importarlo.
-- Solo dueño — igual que Finanzas, trae números de dinero.

create table if not exists research_productos (
  id uuid primary key default gen_random_uuid(),

  -- Datos jalados de Mercado Libre (o capturados a mano si el jalón falla).
  link_mercado_libre text,
  nombre text not null,
  imagen_url text,
  categoria_ml_id text,
  categoria_ml_nombre text,
  precio_referencia_ml numeric not null default 0,
  ventas_ml integer,

  -- Precio al que Isaac piensa vender (por defecto el de referencia, pero
  -- editable — normalmente el más bajo de la competencia).
  precio_venta numeric not null default 0,

  -- Costo estimado de traerlo (mismo patrón que un producto de contenedor).
  precio_compra_dolares numeric not null default 0,
  tipo_cambio_estimado numeric not null default 0,
  piezas_por_caja numeric not null default 1,
  largo_cm numeric not null default 0,
  ancho_cm numeric not null default 0,
  alto_cm numeric not null default 0,
  costo_por_cbm_pesos numeric not null default 0,

  -- Medidas del paquete individual (como le llega a UN cliente de Mercado
  -- Libre) — distintas a las de la caja de importación, para calcular el
  -- costo de envío de Mercado Libre.
  paquete_largo_cm numeric not null default 0,
  paquete_ancho_cm numeric not null default 0,
  paquete_alto_cm numeric not null default 0,
  paquete_peso_fisico_kg numeric,

  -- Comisión y envío de Mercado Libre — el envío se propone solo (con la
  -- tabla oficial) pero ambos quedan editables a mano.
  comision_ml_pct numeric not null default 0,
  envio_gratis boolean not null default false,
  costo_envio_pesos numeric not null default 0,

  -- Resultado calculado, guardado como foto del momento (no se recalcula
  -- solo después, para que el borrador no cambie si mueves un tipo de
  -- cambio general del sistema).
  costo_estimado_pieza_pesos numeric not null default 0,
  margen_estimado_pesos numeric not null default 0,
  margen_estimado_pct numeric not null default 0,

  notas text,
  estado text not null default 'BORRADOR' check (estado in ('BORRADOR', 'CONVERTIDO', 'DESCARTADO')),
  contenedor_asignado_id uuid references contenedores(id) on delete set null,

  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists research_productos_estado_idx on research_productos(estado);

alter table research_productos enable row level security;

create policy "requiere sesion research productos" on research_productos
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

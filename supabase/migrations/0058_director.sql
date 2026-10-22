-- 0058 — Director de Mercado Libre: propuestas y bitácora en el CRM (20 oct 2026).
--
-- Isaac: "vamos a pulir mi CRM para que mi CRM pueda alterar mi cuenta de
-- Mercado Libre y el agente altere el CRM; así ya no necesitamos usar mi
-- Chrome". Fase 1: el Director (agente diario) ya no ejecuta nada: mete sus
-- propuestas en el CRM, Isaac las aprueba o rechaza desde la pantalla
-- /director (desde el celular), y el CRM las ejecuta en Mercado Libre (eso
-- llega en la fase 2; en la fase 1 las aprobadas se marcan "hecha" a mano).
-- Todo queda en una bitácora dentro del sistema, no en un chat.

create table if not exists director_propuestas (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  -- Día de la propuesta (calendario CDMX) y lote = una corrida del Director.
  fecha date not null,
  lote text not null,
  -- Número corrido dentro del lote (el que Isaac contesta: "no el 4").
  orden integer not null,
  -- RELAMPAGO | PROMOCION | PUBLICIDAD | PUBLICACION | FULL | LIGA | AVISO | OTRO
  area text not null,
  titulo text not null,
  detalle text,
  porque text,
  -- Lo que el CRM necesitaría para ejecutarla (fase 2): item_id, precio, etc.
  datos jsonb not null default '{}'::jsonb,
  -- MANUAL = Isaac la hace a mano y la marca hecha; los demás los ejecuta el
  -- CRM cuando exista esa pieza (PROMOCION_DESCUENTO, PARTICIPAR_PROMOCION,
  -- ADS, PUBLICACION, RESPONDER_PREGUNTA...).
  accion_tipo text not null default 'MANUAL',
  item_id text,
  sku_crm text,
  imagen_url text,
  precio_propuesto numeric,
  -- PROPUESTA | APROBADA | RECHAZADA | EJECUTADA | FALLIDA | CADUCADA
  estado text not null default 'PROPUESTA',
  -- Si Isaac cambia el precio al aprobar ("la olla bájala a 1,990").
  precio_aprobado numeric,
  nota_isaac text,
  decidido_en timestamptz,
  -- Desde dónde decidió: CRM (pantalla) o CHAT (se lo dijo al Director).
  decidido_desde text,
  ejecutado_en timestamptz,
  resultado text,
  error text,
  -- El Director marca aquí cuando ya le reportó a Isaac la decisión/ejecución.
  reportada_en timestamptz
);

create index if not exists director_propuestas_estado_idx on director_propuestas (estado, fecha desc);
create index if not exists director_propuestas_lote_idx on director_propuestas (lote, orden);

-- Bitácora: todo lo que pasa alrededor del Director (corridas, decisiones,
-- ejecuciones, errores), con quién lo hizo.
create table if not exists director_bitacora (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  -- DIRECTOR (el agente) | ISAAC (pantalla) | CRM (ejecución automática)
  origen text not null,
  accion text not null,
  propuesta_id uuid references director_propuestas(id) on delete set null,
  detalle jsonb not null default '{}'::jsonb,
  resultado text,
  error text
);

create index if not exists director_bitacora_creado_idx on director_bitacora (creado_en desc);

alter table director_propuestas enable row level security;
alter table director_bitacora enable row level security;
drop policy if exists "dueno administra propuestas director" on director_propuestas;
create policy "dueno administra propuestas director" on director_propuestas
  for all using (es_dueno()) with check (es_dueno());
drop policy if exists "dueno administra bitacora director" on director_bitacora;
create policy "dueno administra bitacora director" on director_bitacora
  for all using (es_dueno()) with check (es_dueno());

comment on table director_propuestas is 'Propuestas diarias del Director de Mercado Libre; Isaac las aprueba/rechaza en /director.';
comment on table director_bitacora is 'Bitácora del Director: corridas, decisiones de Isaac, ejecuciones del CRM y errores.';

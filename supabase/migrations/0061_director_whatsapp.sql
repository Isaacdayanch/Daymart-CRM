-- 0061 — Director Meli: mensajes de Isaac por WhatsApp (era 0059; main ya usa 0059 para el Planeador) (26 oct 2026).
--
-- Isaac: "explícame cómo le puedo dar órdenes al Director desde mi WhatsApp…
-- Meta directo quiero". El CRM recibe los mensajes de WhatsApp de Isaac por
-- el webhook de la API oficial de Meta (/api/whatsapp): los que son
-- decisiones ("va", "no 4 9", "4 a 1990") los aplica él mismo; lo demás
-- queda aquí como órdenes para el Director (las lee por /api/director).
-- Cada mensaje de WhatsApp se guarda una sola vez (wa_id único).

create table if not exists director_mensajes (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  -- id del mensaje en WhatsApp (para no procesarlo dos veces); null si lo
  -- escribió el CRM/Director.
  wa_id text unique,
  -- ENTRADA = lo mandó Isaac; SALIDA = se lo mandamos a Isaac.
  direccion text not null default 'ENTRADA',
  de text,
  texto text not null,
  -- DECISION | ORDEN | CONSULTA | IGNORADO | AVISO
  tipo text not null,
  interpretacion jsonb not null default '{}'::jsonb,
  respuesta text,
  error text,
  -- Para las ÓRDENES: cuándo las leyó/atendió el Director.
  atendido_en timestamptz
);

create index if not exists director_mensajes_creado_idx on director_mensajes (creado_en desc);
create index if not exists director_mensajes_ordenes_idx on director_mensajes (tipo, atendido_en);

alter table director_mensajes enable row level security;
drop policy if exists "dueno ve mensajes director" on director_mensajes;
create policy "dueno ve mensajes director" on director_mensajes
  for all using (es_dueno()) with check (es_dueno());

comment on table director_mensajes is 'Mensajes de WhatsApp entre Isaac y el Director Meli (webhook de Meta); las órdenes libres quedan para el Director.';

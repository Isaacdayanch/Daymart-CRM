-- 0060 — Director Meli: chat dentro del CRM (27 oct 2026).
--
-- Isaac: "¿Por qué no lo abro en un chat y en la página donde dice Director
-- Meli que tenga un chat ahí que le pueda escribir cosas? Más fácil, ya, sin
-- volverme loco ahorita con APIs de WhatsApp." Aprobado con "va".
--
-- El Director deja de ser una sesión de Claude Code: ahora el CRM mismo
-- habla con Claude (misma llave ANTHROPIC_API_KEY que Atención a clientes),
-- con el manual, el calendario y las reglas de Isaac. Isaac le escribe en
-- /director, el Director lee el CRM con sus herramientas, deja propuestas en
-- la misma pantalla y Isaac las aprueba ahí.

-- La conversación (se guarda para que al volver siga ahí).
create table if not exists director_chat (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  -- ISAAC = lo escribió Isaac; DIRECTOR = contestó el Director;
  -- SISTEMA = aviso del CRM (ej. "revisión automática de la mañana", errores).
  rol text not null check (rol in ('ISAAC', 'DIRECTOR', 'SISTEMA')),
  texto text not null,
  -- Qué hizo el Director en ese turno (propuestas creadas, decisiones,
  -- reglas guardadas, herramientas usadas) para mostrarlo chiquito.
  acciones jsonb not null default '[]'::jsonb,
  costo_usd numeric,
  error text,
  -- CHAT = Isaac escribió; MANANA = la corrida automática de la mañana.
  origen text not null default 'CHAT'
);

create index if not exists director_chat_creado_idx on director_chat (creado_en desc);

alter table director_chat enable row level security;
drop policy if exists "dueno ve chat director" on director_chat;
create policy "dueno ve chat director" on director_chat
  for all using (es_dueno()) with check (es_dueno());

-- Configuración del Director (una sola fila, id = 1).
create table if not exists director_config (
  id integer primary key default 1 check (id = 1),
  -- Reglas que Isaac le va dando en el chat (el Director las anota aquí con
  -- fecha). Las reglas base viven en el código (src/lib/director-manual.ts).
  reglas text,
  -- Tope diario de gasto en la IA del Director, en dólares (aparte del de
  -- Atención a clientes).
  limite_diario_usd numeric not null default 2 check (limite_diario_usd > 0 and limite_diario_usd <= 5),
  -- Lista automática de la mañana (la arma el reloj del CRM, sin Isaac).
  lista_manana boolean not null default true,
  hora_manana text not null default '08:25',
  -- Último día (AAAA-MM-DD, CDMX) en que se corrió la lista de la mañana.
  ultima_manana date,
  actualizado_en timestamptz not null default now()
);

insert into director_config (id) values (1) on conflict (id) do nothing;

alter table director_config enable row level security;
drop policy if exists "dueno ve config director" on director_config;
create policy "dueno ve config director" on director_config
  for all using (es_dueno()) with check (es_dueno());

-- El gasto de la IA se sigue anotando en mercadolibre_ia_gastos; `origen`
-- separa el tope del Director del de Atención a clientes.
alter table mercadolibre_ia_gastos add column if not exists origen text not null default 'ATENCION';
create index if not exists mercadolibre_ia_gastos_origen_idx on mercadolibre_ia_gastos (origen, creado_en);

comment on table director_chat is 'Chat entre Isaac y el Director Meli dentro del CRM (/director).';
comment on table director_config is 'Reglas, tope diario y lista de la mañana del Director Meli.';

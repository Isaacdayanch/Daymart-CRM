-- Atención a clientes de Mercado Libre — Fase 1: preguntas (21 oct).
-- Isaac: "que el sistema sepa contestar preguntas automáticamente y me
-- pregunte… que yo esté atento, pero que todo funcione solo".
--
-- Cada pregunta de ML se copia aquí. La IA le escribe un BORRADOR (con su
-- confianza y por qué) y Isaac lo aprueba, lo corrige o lo descarta; lo que
-- se manda a ML queda en `respuesta_enviada`. Cuando Isaac corrige un
-- borrador (`editada`), esa corrección sirve de ejemplo para las siguientes.
--
-- RLS activado SIN políticas (igual que las demás tablas de ML): solo el
-- servidor las lee con la service role key.

create table if not exists mercadolibre_preguntas (
  id bigint primary key,                 -- id de la pregunta en ML
  item_id text not null,
  texto text not null,
  fecha_creacion timestamptz not null,
  comprador_id bigint,
  estado_ml text,                        -- UNANSWERED, ANSWERED, CLOSED_UNANSWERED, BANNED, DELETED…
  -- Estado en el CRM: PENDIENTE (por responder) | RESPONDIDA | DESCARTADA | CERRADA
  estado text not null default 'PENDIENTE',
  borrador text,
  borrador_original text,                -- lo que escribió la IA (para aprender de las correcciones)
  confianza text,                        -- alta | media | baja
  categoria text,
  nota_ia text,                          -- qué le falta saber o por qué duda
  borrador_generado_en timestamptz,
  borrador_error text,
  respuesta_enviada text,
  respondida_en timestamptz,
  respondida_por text,                   -- crm | ml (contestada directo en ML)
  editada boolean not null default false,
  avisado_en timestamptz,                -- aviso al celular (Telegram)
  crudo jsonb,
  actualizado_en timestamptz not null default now()
);

create index if not exists mercadolibre_preguntas_estado_idx on mercadolibre_preguntas (estado, fecha_creacion desc);
create index if not exists mercadolibre_preguntas_item_idx on mercadolibre_preguntas (item_id, fecha_creacion desc);

alter table mercadolibre_preguntas enable row level security;

-- Configuración de atención (una sola fila, id = 1): reglas de la casa que
-- la IA siempre respeta (envíos, factura, garantía…), el tope diario de gasto
-- en la IA (máx. $2 USD, Isaac 22 oct) y el WhatsApp donde le llegan los
-- avisos (CallMeBot: su celular + la apikey que le manda CallMeBot).
create table if not exists mercadolibre_atencion_config (
  id integer primary key default 1 check (id = 1),
  reglas text,
  actualizado_en timestamptz not null default now()
);

alter table mercadolibre_atencion_config add column if not exists limite_diario_usd numeric not null default 1 check (limite_diario_usd > 0 and limite_diario_usd <= 2);
alter table mercadolibre_atencion_config add column if not exists whatsapp_telefono text;
alter table mercadolibre_atencion_config add column if not exists whatsapp_apikey text;

insert into mercadolibre_atencion_config (id) values (1) on conflict (id) do nothing;

alter table mercadolibre_atencion_config enable row level security;

-- Lo que costó cada llamada a la IA (dólares), para el tope diario.
create table if not exists mercadolibre_ia_gastos (
  id bigint generated always as identity primary key,
  pregunta_id bigint,
  costo_usd numeric not null,
  creado_en timestamptz not null default now()
);

create index if not exists mercadolibre_ia_gastos_fecha_idx on mercadolibre_ia_gastos (creado_en);

alter table mercadolibre_ia_gastos enable row level security;

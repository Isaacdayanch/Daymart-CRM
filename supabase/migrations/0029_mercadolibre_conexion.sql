-- Conexión con Mercado Libre (Módulo 5). Guarda las llaves de acceso que
-- Mercado Libre le da al CRM cuando Isaac autoriza su cuenta, y las
-- notificaciones que Mercado Libre manda (ventas nuevas, cambios de
-- publicaciones, envíos).
--
-- SEGURIDAD: estas dos tablas tienen RLS activado SIN ninguna política —
-- eso significa que NADIE puede leerlas desde el navegador (ni el dueño ni
-- la operadora, ni con sesión). Solo el servidor, con la service role key,
-- las toca. Las llaves de acceso equivalen a la contraseña de Mercado Libre
-- de Isaac: jamás deben viajar al navegador.

create table if not exists mercadolibre_conexion (
  id integer primary key default 1 check (id = 1),
  ml_user_id bigint not null,
  nickname text,
  access_token text not null,
  refresh_token text not null,
  expira_en timestamptz not null,
  scope text,
  conectado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists mercadolibre_notificaciones (
  id uuid primary key default gen_random_uuid(),
  topic text,
  resource text,
  ml_user_id bigint,
  application_id bigint,
  payload jsonb,
  recibido_en timestamptz not null default now(),
  procesado_en timestamptz
);

create index if not exists mercadolibre_notificaciones_recibido_idx on mercadolibre_notificaciones(recibido_en desc);

alter table mercadolibre_conexion enable row level security;
alter table mercadolibre_notificaciones enable row level security;
-- Sin políticas a propósito: solo la service role key (servidor) puede leer/escribir.

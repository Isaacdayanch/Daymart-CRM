-- 0062 — Dinero real de Mercado Pago (3 nov 2026).
--
-- Isaac: "siento que la matemática interna me descuenta una comisión extra a
-- lo que realmente Mercado Libre me descuenta… que el CRM descargue solito el
-- resumen y tengamos el dato exacto de lo que entró, el flujo entrante".
--
-- El CRM pide a Mercado Pago su "Reporte de liberaciones" (release report),
-- lo descarga y guarda cada renglón tal cual. De ahí sale, venta por venta,
-- lo que de verdad se quedó Mercado Libre (comisión, envío, impuestos) y lo
-- que le llegó a Isaac. Ese dato manda sobre lo que el CRM calculaba.
--
-- RLS activado SIN políticas (igual que las demás tablas de ML/MP): solo el
-- servidor las lee con la service role key.

-- Cada renglón del reporte de liberaciones, tal cual lo da Mercado Pago.
create table if not exists mercadopago_movimientos (
  id text primary key,                   -- huella del renglón (no se duplica si dos reportes se enciman)
  fecha timestamptz,                     -- cuándo se liberó (DATE)
  source_id text,                        -- id de la operación en Mercado Pago (el cobro)
  external_reference text,
  orden_id bigint,                       -- ORDER_ID si el reporte lo trae
  pack_id bigint,
  envio_id bigint,
  tipo text,                             -- RECORD_TYPE (release, block, unblock…)
  descripcion text,                      -- DESCRIPTION (payment, refund, shipping, withdrawal…)
  bruto numeric,                         -- GROSS_AMOUNT
  comision numeric,                      -- MP_FEE_AMOUNT (comisión de ML/MP, positiva)
  financiamiento numeric,                -- FINANCING_FEE_AMOUNT (meses sin intereses)
  envio numeric,                         -- SHIPPING_FEE_AMOUNT
  impuestos numeric,                     -- TAXES_AMOUNT (retenciones)
  cupon numeric,                         -- COUPON_AMOUNT
  neto numeric,                          -- NET_CREDIT_AMOUNT − NET_DEBIT_AMOUNT (lo que de verdad entró o salió)
  reporte text,                          -- archivo del que vino
  crudo jsonb,
  importado_en timestamptz not null default now()
);

create index if not exists mercadopago_movimientos_fecha_idx on mercadopago_movimientos (fecha);
create index if not exists mercadopago_movimientos_source_idx on mercadopago_movimientos (source_id);
create index if not exists mercadopago_movimientos_orden_idx on mercadopago_movimientos (orden_id);

alter table mercadopago_movimientos enable row level security;

-- Reportes que ya se descargaron (para no bajarlos dos veces).
create table if not exists mercadopago_reportes (
  archivo text primary key,
  desde timestamptz,
  hasta timestamptz,
  renglones integer not null default 0,
  importado_en timestamptz not null default now()
);

alter table mercadopago_reportes enable row level security;

-- Estado de la conexión con Mercado Pago (una sola fila, id = 1).
create table if not exists mercadopago_sync (
  id integer primary key default 1 check (id = 1),
  configurado_en timestamptz,            -- cuándo se dio de alta la configuración del reporte en MP
  ultima_solicitud timestamptz,          -- cuándo se pidió el último reporte
  ultima_solicitud_desde timestamptz,
  ultima_solicitud_hasta timestamptz,
  ultima_importacion timestamptz,
  ultimo_error text,
  columnas jsonb,                        -- columnas que trajo el último reporte (diagnóstico)
  actualizado_en timestamptz not null default now()
);

insert into mercadopago_sync (id) values (1) on conflict (id) do nothing;
alter table mercadopago_sync enable row level security;

-- En cada venta de ML: sus cobros de Mercado Pago (para cruzar con el
-- reporte) y los montos EXACTOS que salieron del reporte.
alter table mercadolibre_ordenes add column if not exists pago_ids bigint[];
alter table mercadolibre_ordenes add column if not exists mp_bruto numeric;
alter table mercadolibre_ordenes add column if not exists mp_comision numeric;
alter table mercadolibre_ordenes add column if not exists mp_envio numeric;
alter table mercadolibre_ordenes add column if not exists mp_impuestos numeric;
alter table mercadolibre_ordenes add column if not exists mp_neto numeric;
alter table mercadolibre_ordenes add column if not exists mp_actualizado_en timestamptz;

create index if not exists mercadolibre_ordenes_pago_ids_idx on mercadolibre_ordenes using gin (pago_ids);

-- Los cobros de las ventas que ya estaban guardadas salen de su payload.
update mercadolibre_ordenes o
set pago_ids = sub.ids
from (
  select id, array_agg((p->>'id')::bigint) as ids
  from mercadolibre_ordenes, jsonb_array_elements(case when jsonb_typeof(payload->'payments') = 'array' then payload->'payments' else '[]'::jsonb end) p
  where p->>'id' ~ '^[0-9]+$'
  group by id
) sub
where o.id = sub.id and o.pago_ids is null;

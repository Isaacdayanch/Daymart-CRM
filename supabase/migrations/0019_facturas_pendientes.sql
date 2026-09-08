-- Seguimiento de facturas pendientes de pagar (proveedores en México, etc.)
-- — no son un préstamo ni un pago a China, son cuentas por pagar sueltas
-- que Isaac quiere ver venir con su fecha límite. Al marcarse "Pagada" se
-- genera su movimiento de salida en Finanzas (mismo principio de "una sola
-- captura" que el resto del sistema): la factura guarda el id del
-- movimiento que generó, nunca al revés.

create table if not exists facturas_pendientes (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null,
  concepto text,
  monto numeric not null check (monto > 0),
  moneda text not null default 'MXN' check (moneda in ('MXN', 'USD')),
  fecha_emision timestamptz not null default now(),
  fecha_limite timestamptz,
  pagada boolean not null default false,
  movimiento_financiero_id uuid references movimientos_financieros(id) on delete set null,
  notas text,
  creado_en timestamptz not null default now()
);

create index if not exists facturas_pendientes_pagada_idx on facturas_pendientes(pagada);

alter table facturas_pendientes enable row level security;

create policy "requiere sesion facturas pendientes" on facturas_pendientes
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

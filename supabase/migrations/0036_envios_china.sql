-- "Mandar dinero a China" en una sola captura, con "la comisión la sé
-- después": hoy se registra la transferencia a la cuenta puente (Jaim T.)
-- y queda un pendiente ámbar; cuando llega el recibo, Isaac pone la
-- comisión y los dólares y el sistema hace el resto (abono al proveedor,
-- abono al contenedor con tipo de cambio efectivo, saldo con Jaime).
create table if not exists envios_china (
  id uuid primary key default gen_random_uuid(),
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'COMPLETADO', 'CANCELADO')),
  cuenta_origen_id uuid references cuentas_financieras(id),
  -- null = directo (sin intermediario)
  cuenta_puente_id uuid references cuentas_financieras(id),
  movimiento_transferencia_id uuid references movimientos_financieros(id) on delete set null,
  proveedor text not null,
  moneda_proveedor text not null default 'USD',
  contenedor_id uuid references contenedores(id) on delete set null,
  abono_pendiente_id uuid,
  monto_pesos numeric not null check (monto_pesos > 0),
  comision_pesos numeric,
  monto_dolares numeric,
  fecha timestamptz not null default now(),
  notas text,
  creado_en timestamptz not null default now(),
  completado_en timestamptz,
  movimiento_envio_id uuid references movimientos_financieros(id) on delete set null
);

alter table envios_china enable row level security;
create policy "requiere sesion envios china" on envios_china
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- "La comisión la sé después" en CUALQUIER salida o transferencia: el
-- movimiento se guarda por el monto completo y queda marcado; al poner la
-- comisión, el monto baja al neto y la comisión se separa como gasto.
alter table movimientos_financieros add column if not exists comision_pendiente boolean not null default false;

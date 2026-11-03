-- Pagos de flete, aduana y otros gastos del contenedor ligados a Finanzas
-- (Isaac, 3 nov: "quiero registrar el pago del forwarder en el contenedor y
-- a la vez es una deuda que estaba en estimados y que se registra en
-- Finanzas, que salió de Jaim T. … quitarle el botón de estimado y ponerle
-- un botón para que se registre el pago").
--
-- Mismo principio que los abonos de mercancía: UNA sola captura. Cada pago
-- guarda el id del movimiento de Finanzas que generó; si se quita el pago,
-- se quita su movimiento. El monto del flete/aduana/otros gastos del
-- contenedor deja de ser "estimado" en cuanto hay un pago completo.
create table if not exists pagos_gastos_contenedor (
  id uuid primary key default gen_random_uuid(),
  contenedor_id uuid not null references contenedores(id) on delete cascade,
  concepto text not null check (concepto in ('FLETE', 'ADUANA', 'OTROS')),
  fecha timestamptz not null default now(),
  -- Pesos que salieron de la cuenta (sin la comisión) y la comisión aparte.
  -- Las dos se absorben al costo del contenedor (igual que en los abonos).
  monto_pesos numeric not null check (monto_pesos >= 0),
  comision_pesos numeric not null default 0 check (comision_pesos >= 0),
  -- Dólares pagados (flete / otros gastos). La aduana es en pesos: null.
  monto_dolares numeric check (monto_dolares is null or monto_dolares >= 0),
  -- Forwarder / agente aduanal / a quién se le pagó.
  proveedor text,
  notas text,
  -- null = "sin cuenta (fue antes de usar el sistema)": no hay movimiento.
  cuenta_id uuid references cuentas_financieras(id) on delete set null,
  movimiento_financiero_id uuid references movimientos_financieros(id) on delete set null,
  -- Si el pago se aplicó a una deuda ya registrada en Finanzas → Proveedores.
  abono_deuda_id uuid references movimientos_deuda_proveedor(id) on delete set null,
  creado_en timestamptz not null default now()
);

create index if not exists pagos_gastos_contenedor_contenedor_idx on pagos_gastos_contenedor(contenedor_id);
create index if not exists pagos_gastos_contenedor_movimiento_idx on pagos_gastos_contenedor(movimiento_financiero_id);

alter table pagos_gastos_contenedor enable row level security;
create policy "requiere sesion pagos gastos contenedor" on pagos_gastos_contenedor
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

notify pgrst, 'reload schema';

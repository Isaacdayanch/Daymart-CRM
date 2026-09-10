-- Facturas pendientes: antes solo se podían marcar "Pagada" de un jalón.
-- Isaac quiere ir abonando poco a poco a una factura (ej. folio 123 por
-- $1,000,000 ya con IVA) hasta saldarla — mismo patrón de "un libro de
-- movimientos" que ya usa el resto del sistema: el saldo de la factura
-- NUNCA se guarda a mano, se calcula (monto − suma de sus pagos). Estos
-- pagos son independientes de préstamos/deuda de proveedores/crédito de
-- China — nunca tocan esas tablas, solo generan su salida normal en el
-- libro general de Finanzas (mismo mecanismo de "una sola captura").

alter table facturas_pendientes add column if not exists folio text;

create table if not exists pagos_factura (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid not null references facturas_pendientes(id) on delete cascade,
  monto numeric not null check (monto > 0),
  fecha timestamptz not null default now(),
  cuenta_id uuid not null references cuentas_financieras(id),
  categoria_id uuid references categorias_financieras(id),
  notas text,
  movimiento_financiero_id uuid references movimientos_financieros(id) on delete set null,
  creado_en timestamptz not null default now()
);

create index if not exists pagos_factura_factura_idx on pagos_factura(factura_id);

alter table pagos_factura enable row level security;

create policy "requiere sesion pagos factura" on pagos_factura
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

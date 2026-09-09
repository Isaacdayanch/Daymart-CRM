-- Socios (aportes de capital / repartos), Prestamistas (préstamos / pagos) y
-- Deuda con proveedores (cargos / abonos) — mismo patrón que ya usa el
-- sistema en varios lados (registros_ganancia de Maaser, movimientos_stock):
-- un solo libro por catálogo con tipo de movimiento, en vez de tablas
-- separadas de "entrada" y "salida". El saldo de cada socio/prestamista/
-- proveedor NUNCA se guarda a mano, se calcula sumando/restando su libro.
--
-- cuenta_id y movimiento_financiero_id son OPCIONALES a propósito: sirven
-- para cargar historial (préstamos y aportes de antes de tener el sistema,
-- donde no siempre se sabe a qué cuenta exacta entró el dinero) sin
-- inventar una cuenta falsa. Para cualquier registro NUEVO capturado desde
-- la pantalla, la acción del servidor sí exige cuenta y genera su
-- movimiento real en Finanzas (mismo principio de "una sola captura" de
-- todo el módulo) — la columna se queda nula solo para lo histórico.

create table if not exists socios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  creado_en timestamptz not null default now()
);

create table if not exists movimientos_socio (
  id uuid primary key default gen_random_uuid(),
  socio_id uuid not null references socios(id),
  tipo text not null check (tipo in ('APORTE', 'REPARTO')),
  monto numeric not null check (monto > 0),
  moneda text not null default 'MXN' check (moneda in ('MXN', 'USD')),
  fecha timestamptz not null default now(),
  notas text,
  cuenta_id uuid references cuentas_financieras(id),
  movimiento_financiero_id uuid references movimientos_financieros(id) on delete set null,
  creado_en timestamptz not null default now()
);

create table if not exists prestamistas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  notas text,
  creado_en timestamptz not null default now()
);

create table if not exists movimientos_prestamista (
  id uuid primary key default gen_random_uuid(),
  prestamista_id uuid not null references prestamistas(id),
  tipo text not null check (tipo in ('PRESTAMO', 'PAGO')),
  monto numeric not null check (monto > 0),
  moneda text not null default 'MXN' check (moneda in ('MXN', 'USD')),
  fecha timestamptz not null default now(),
  notas text,
  cuenta_id uuid references cuentas_financieras(id),
  movimiento_financiero_id uuid references movimientos_financieros(id) on delete set null,
  creado_en timestamptz not null default now()
);

-- La deuda con proveedores es por PROVEEDOR (texto libre, igual que
-- fabrica/proveedor en Productos) y no por contenedor específico — un pago
-- se abona "a cuenta" del proveedor en general, aunque puede anotarse a qué
-- contenedor corresponde el cargo original.
create table if not exists movimientos_deuda_proveedor (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null,
  tipo text not null check (tipo in ('CARGO', 'ABONO')),
  monto numeric not null check (monto > 0),
  moneda text not null default 'USD' check (moneda in ('MXN', 'USD')),
  fecha timestamptz not null default now(),
  notas text,
  contenedor_id uuid references contenedores(id) on delete set null,
  cuenta_id uuid references cuentas_financieras(id),
  movimiento_financiero_id uuid references movimientos_financieros(id) on delete set null,
  creado_en timestamptz not null default now()
);

create index if not exists movimientos_socio_socio_idx on movimientos_socio(socio_id);
create index if not exists movimientos_prestamista_prestamista_idx on movimientos_prestamista(prestamista_id);
create index if not exists movimientos_deuda_proveedor_proveedor_idx on movimientos_deuda_proveedor(proveedor);

alter table socios enable row level security;
alter table movimientos_socio enable row level security;
alter table prestamistas enable row level security;
alter table movimientos_prestamista enable row level security;
alter table movimientos_deuda_proveedor enable row level security;

create policy "requiere sesion socios" on socios
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "requiere sesion movimientos socio" on movimientos_socio
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "requiere sesion prestamistas" on prestamistas
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "requiere sesion movimientos prestamista" on movimientos_prestamista
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "requiere sesion movimientos deuda proveedor" on movimientos_deuda_proveedor
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Categorías correctas de Isaac (su lista real de "Listas Conceptos") — se
-- agregan las que faltan, sin tocar las que ya existían. Las que el sistema
-- genera solo (aportes, préstamos, repartos, pagos a proveedores, ventas
-- para el cálculo de reinversión) quedan "fijas" para que no se borren por
-- accidente, igual que Comisiones/Sueldo/Maaser.
insert into categorias_financieras (nombre, fija, orden)
values
  ('Aporte a capital', true, 8),
  ('Préstamo recibido', true, 9),
  ('Pago préstamo', true, 10),
  ('Repartos', true, 11),
  ('Pago proveedor', true, 12),
  ('Ventas', true, 13),
  ('Compra de mercancía', false, 14),
  ('Gastos de Importación', false, 15),
  ('Gastos Generales', false, 16),
  ('Pago flete', false, 17),
  ('Pago impuestos', false, 18),
  ('Pago nómina', false, 19),
  ('Pago transporte local', false, 20),
  ('Pago viáticos', false, 21),
  ('Renta', false, 22),
  ('Retiro personal', false, 23),
  ('Sueldo ID', false, 24),
  ('Dividendos', false, 25),
  ('Reinversión Daymart', false, 26),
  ('Honorarios contables, legales y asesorías', false, 27),
  ('Intereses cobrados', false, 28),
  ('Otros gastos operativos menores', false, 29),
  ('Otros ingresos operativos', false, 30),
  ('Pago mantenimiento', false, 31),
  ('Pago papelería y suministros', false, 32),
  ('Pago aduana', false, 33),
  ('Pago publicidad y marketing', false, 34),
  ('Reembolso recibido', false, 35),
  ('Pago servicios (luz, teléfono, internet)', false, 36),
  ('Transferencia entre cuentas', false, 37)
on conflict (nombre) do nothing;

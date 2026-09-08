-- Módulo 3: Finanzas. Primer bloque: cuentas, categorías y el libro único de
-- movimientos financieros (mismo principio que movimientos_stock: el saldo
-- de cada cuenta nunca se guarda a mano, se calcula sumando/restando este
-- libro). Los campos de "referencia" (referencia_tipo/referencia_id) sirven
-- para ligar un movimiento a su origen real (un préstamo, un pago a China,
-- una comisión...) sin duplicar datos — se construyen más adelante.

create table if not exists cuentas_financieras (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  tipo text not null default 'OTRO' check (tipo in ('EFECTIVO', 'BANCO', 'OTRO')),
  eliminado_en timestamptz,
  creado_en timestamptz not null default now()
);

insert into cuentas_financieras (nombre, tipo)
values
  ('Caja de efectivo', 'EFECTIVO'),
  ('Banco BBVA', 'BANCO')
on conflict (nombre) do nothing;

create table if not exists categorias_financieras (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  -- Categorías "fijas" (Comisiones, Sueldo) no se pueden borrar desde la
  -- pantalla porque otras partes del sistema las usan automáticamente.
  fija boolean not null default false,
  orden integer not null default 0,
  eliminado_en timestamptz,
  creado_en timestamptz not null default now()
);

insert into categorias_financieras (nombre, fija, orden)
values
  ('Nómina', false, 1),
  ('Bodega', false, 2),
  ('Logística', false, 3),
  ('Importación', false, 4),
  ('Comisiones', true, 5),
  ('Sueldo', true, 6)
on conflict (nombre) do nothing;

create table if not exists movimientos_financieros (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('ENTRADA', 'SALIDA', 'TRANSFERENCIA')),
  cuenta_id uuid not null references cuentas_financieras(id),
  -- Solo se usa cuando tipo = 'TRANSFERENCIA': a qué cuenta propia llegó el
  -- dinero (cuenta_id es de dónde salió). Una transferencia es un solo
  -- movimiento, no dos — no cuenta como ingreso ni gasto en los reportes.
  cuenta_destino_id uuid references cuentas_financieras(id),
  categoria_id uuid references categorias_financieras(id),
  monto numeric not null check (monto > 0),
  moneda text not null default 'MXN' check (moneda in ('MXN', 'USD')),
  fecha timestamptz not null default now(),
  contraparte text,
  notas text,
  -- De dónde viene este movimiento cuando no fue capturado a mano aquí
  -- (ej. 'PRESTAMO', 'PAGO_CHINA', 'PAGO_ADUANA', 'COMISION'), y el id de
  -- ese registro origen. Null para movimientos manuales normales.
  referencia_tipo text,
  referencia_id uuid,
  creado_en timestamptz not null default now()
);

create index if not exists movimientos_financieros_cuenta_idx on movimientos_financieros(cuenta_id);
create index if not exists movimientos_financieros_categoria_idx on movimientos_financieros(categoria_id);
create index if not exists movimientos_financieros_referencia_idx on movimientos_financieros(referencia_tipo, referencia_id);

alter table cuentas_financieras enable row level security;
alter table categorias_financieras enable row level security;
alter table movimientos_financieros enable row level security;

create policy "requiere sesion cuentas financieras" on cuentas_financieras
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "requiere sesion categorias financieras" on categorias_financieras
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "requiere sesion movimientos financieros" on movimientos_financieros
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

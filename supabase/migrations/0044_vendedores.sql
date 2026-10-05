-- Módulo Vendedores (aprobado por Isaac el 5 oct: "hazlo como me recomendaste").
--
-- Vendedores externos (venden los productos de Daymart a sus clientes y
-- cobran comisión). Cada vendedor tiene:
--   * un link PRIVADO (token_vendedor): ve fotos, descripción, piezas en
--     bodega, precio de venta y SU comisión por pieza. Nunca costos.
--   * un link PARA SUS CLIENTES (token_clientes): mismo catálogo sin
--     precios (salvo que Isaac active clientes_ven_precios) y sin
--     cantidades exactas (solo "Disponible" / "Agotado").
-- Una sola lista de precios para todos (productos_catalogo.precio_venta);
-- la comisión es por vendedor (% o monto fijo por pieza) con excepciones
-- por producto en comisiones_vendedor_producto.
--
-- Esta migración INCLUYE lo de la 0043 (descripción de la pieza) y
-- reemplaza la tabla accesos_catalogo por vendedores, así que basta con
-- correr esta.

alter table productos_catalogo add column if not exists descripcion text;
-- Precio de venta al público para los vendedores (sin IVA, igual que en
-- Ventas directas). Null = sin precio todavía: no sale en el link del vendedor.
alter table productos_catalogo add column if not exists precio_venta numeric;

create table if not exists vendedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  notas text,
  -- Comisión habitual: porcentaje sobre el precio de venta y/o monto fijo
  -- por pieza (se suman si los dos tienen valor).
  comision_pct numeric not null default 10,
  comision_fija numeric not null default 0,
  token_vendedor text not null unique,
  token_clientes text not null unique,
  clientes_ven_precios boolean not null default false,
  creado_en timestamptz not null default now(),
  ultimo_acceso_en timestamptz,
  visitas integer not null default 0,
  ultimo_acceso_clientes_en timestamptz,
  visitas_clientes integer not null default 0,
  -- Cortar el acceso = poner fecha aquí; sus DOS links dejan de funcionar.
  revocado_en timestamptz,
  eliminado_en timestamptz
);

-- Comisión especial de un vendedor para un producto concreto (si no hay
-- renglón, aplica la comisión habitual del vendedor).
create table if not exists comisiones_vendedor_producto (
  vendedor_id uuid not null references vendedores(id) on delete cascade,
  sku text not null,
  comision_pct numeric not null default 0,
  comision_fija numeric not null default 0,
  primary key (vendedor_id, sku)
);

alter table vendedores enable row level security;
alter table comisiones_vendedor_producto enable row level security;
drop policy if exists "dueno administra vendedores" on vendedores;
create policy "dueno administra vendedores" on vendedores
  for all using (es_dueno()) with check (es_dueno());
drop policy if exists "dueno administra comisiones vendedor" on comisiones_vendedor_producto;
create policy "dueno administra comisiones vendedor" on comisiones_vendedor_producto
  for all using (es_dueno()) with check (es_dueno());

-- Si se alcanzó a correr la 0043 (links en Stock → Catálogo), esos accesos
-- pasan a ser vendedores con el mismo link privado, y la tabla vieja se va.
do $$
begin
  if to_regclass('public.accesos_catalogo') is not null then
    insert into vendedores (nombre, notas, token_vendedor, token_clientes, creado_en, ultimo_acceso_en, visitas, revocado_en)
    select nombre, notas, token, md5(random()::text || clock_timestamp()::text) || md5(random()::text), creado_en, ultimo_acceso_en, visitas, revocado_en
    from accesos_catalogo
    on conflict do nothing;
    drop table accesos_catalogo;
  end if;
end $$;

notify pgrst, 'reload schema';

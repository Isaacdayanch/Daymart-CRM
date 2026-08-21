-- Fábrica/Proveedor "principal" del contenedor: se usa para rellenar
-- automáticamente cada producto nuevo (la mayoría de los contenedores son
-- de un solo proveedor). Sigue siendo editable por producto para los
-- contenedores consolidados.
alter table contenedores add column if not exists fabrica_principal text;
alter table contenedores add column if not exists proveedor_principal text;

-- Documentación del contenedor (telex, BL, HBL, invoice, packing list, etc.)
create type tipo_documento as enum (
  'TELEX',
  'PACKING_LIST',
  'INVOICE',
  'TELEX_RELEASE',
  'BL',
  'HBL'
);

create table if not exists documentos_contenedor (
  id uuid primary key default gen_random_uuid(),
  contenedor_id uuid not null references contenedores(id) on delete cascade,
  tipo tipo_documento not null,
  ruta_archivo text not null,
  nombre_archivo text not null,
  subido_en timestamptz not null default now(),
  unique (contenedor_id, tipo)
);

alter table documentos_contenedor enable row level security;

drop policy if exists "acceso abierto documentos contenedor" on documentos_contenedor;
create policy "acceso abierto documentos contenedor"
  on documentos_contenedor for all
  using (true)
  with check (true);

-- Buckets de almacenamiento: fotos de producto (públicas, para verlas
-- fácil) y documentos del contenedor (privados, se acceden con link
-- temporal firmado).
insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

drop policy if exists "acceso abierto storage productos" on storage.objects;
create policy "acceso abierto storage productos"
  on storage.objects for all
  using (bucket_id = 'productos')
  with check (bucket_id = 'productos');

drop policy if exists "acceso abierto storage documentos" on storage.objects;
create policy "acceso abierto storage documentos"
  on storage.objects for all
  using (bucket_id = 'documentos')
  with check (bucket_id = 'documentos');

-- Precio propio del vendedor (Isaac, 6 oct: "el precio que yo pongo es el
-- mínimo que tiene autorizado; el vendedor puede subirlo").
--
-- productos_catalogo.precio_venta pasa a ser el PRECIO MÍNIMO autorizado.
-- Cada vendedor puede fijar, por producto, un precio igual o mayor desde su
-- link privado; ese es el que ven sus clientes (si el vendedor tiene
-- activado que sus clientes vean precios). Lo que suba por encima del
-- mínimo es suyo completo; su comisión normal se calcula sobre el mínimo.
create table if not exists precios_vendedor (
  vendedor_id uuid not null references vendedores(id) on delete cascade,
  sku text not null,
  precio numeric not null check (precio > 0),
  actualizado_en timestamptz not null default now(),
  primary key (vendedor_id, sku)
);

-- Isaac lo ve/edita con su sesión; el vendedor escribe desde su link SIN
-- sesión, a través del servidor (service role key) que valida su token y
-- que el precio no baje del mínimo.
alter table precios_vendedor enable row level security;
drop policy if exists "dueno administra precios vendedor" on precios_vendedor;
create policy "dueno administra precios vendedor" on precios_vendedor
  for all using (es_dueno()) with check (es_dueno());

notify pgrst, 'reload schema';

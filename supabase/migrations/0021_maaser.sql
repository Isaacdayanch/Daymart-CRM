-- Maaser (diezmo): apartado dentro de Finanzas para llevar el 10% de la
-- ganancia neta de Isaac. Como todavía no hay forma de calcular la
-- ganancia sola (eso requiere ventas conectadas a Mercado Libre, Módulo
-- 4), Isaac registra su ganancia neta a mano cada vez que la calcula —
-- registros_ganancia es solo informativo, no mueve dinero de ninguna
-- cuenta. Los pagos de Maaser sí son dinero real: se registran como
-- cualquier salida normal de Finanzas (formulario ya existente) con la
-- categoría fija "Maaser" — sin doble captura ni pantalla aparte para
-- "pagar Maaser".

insert into categorias_financieras (nombre, fija, orden)
values ('Maaser', true, 7)
on conflict (nombre) do nothing;

create table if not exists registros_ganancia (
  id uuid primary key default gen_random_uuid(),
  monto numeric not null check (monto > 0),
  fecha timestamptz not null default now(),
  notas text,
  creado_en timestamptz not null default now()
);

alter table registros_ganancia enable row level security;

create policy "requiere sesion registros ganancia" on registros_ganancia
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

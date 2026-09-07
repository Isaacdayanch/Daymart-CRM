-- Perfiles de usuario: cada cuenta de Supabase Auth (creada a mano por
-- Isaac desde el Dashboard) tiene aquí su rol dentro del sistema.
-- "dueno" ve y edita todo. "operadora" solo puede entrar a Stock/Salidas
-- (la app se encarga de restringir las páginas; aquí solo se guarda el rol).
create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol text not null check (rol in ('dueno', 'operadora')),
  nombre text,
  creado_en timestamptz not null default now()
);

alter table perfiles enable row level security;

-- Función auxiliar (security definer = corre saltándose RLS) para saber si
-- quien hace la petición es el dueño, sin caer en recursión al consultar
-- la propia tabla perfiles dentro de sus políticas.
create or replace function es_dueno()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = 'dueno');
$$;

-- También security definer: si no fuera así, alguien SIN perfil vería la
-- tabla vacía por culpa de las políticas de lectura (no porque de verdad
-- esté vacía) y podría "reclamar" ser dueño aunque ya hubiera uno.
create or replace function no_hay_duenos()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (select 1 from perfiles where rol = 'dueno');
$$;

drop policy if exists "cada quien ve su propio perfil" on perfiles;
create policy "cada quien ve su propio perfil" on perfiles
  for select using (auth.uid() = id);

drop policy if exists "dueno ve todos los perfiles" on perfiles;
create policy "dueno ve todos los perfiles" on perfiles
  for select using (es_dueno());

-- Primer usuario (tabla vacía) se puede dar de alta a sí mismo como dueño —
-- así Isaac no se queda sin poder entrar la primera vez. Después de eso,
-- solo el dueño puede dar de alta perfiles nuevos (para la operadora, etc).
drop policy if exists "primer usuario se vuelve dueno" on perfiles;
create policy "primer usuario se vuelve dueno" on perfiles
  for insert with check (auth.uid() = id and no_hay_duenos());

drop policy if exists "dueno da de alta perfiles" on perfiles;
create policy "dueno da de alta perfiles" on perfiles
  for insert with check (es_dueno());

drop policy if exists "dueno actualiza perfiles" on perfiles;
create policy "dueno actualiza perfiles" on perfiles
  for update using (es_dueno());

grant execute on function es_dueno() to authenticated;
grant execute on function no_hay_duenos() to authenticated;

notify pgrst, 'reload schema';

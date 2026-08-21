-- Todavía no hay pantalla de login (Isaac es el único usuario por ahora),
-- así que las políticas que exigían "authenticated" bloqueaban todo,
-- incluso al propio Isaac. Se abre el acceso mientras no haya login.
-- TODO: cuando se agregue login, volver a restringir por usuario.

drop policy if exists "usuarios autenticados leen y escriben contenedores" on contenedores;
create policy "acceso abierto contenedores"
  on contenedores for all
  using (true)
  with check (true);

drop policy if exists "usuarios autenticados leen y escriben productos" on productos;
create policy "acceso abierto productos"
  on productos for all
  using (true)
  with check (true);

drop policy if exists "usuarios autenticados leen y escriben pagos de mercancia" on pagos_mercancia;
create policy "acceso abierto pagos de mercancia"
  on pagos_mercancia for all
  using (true)
  with check (true);

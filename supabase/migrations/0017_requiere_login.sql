-- Hasta ahora todo el sistema estaba "abierto" (cualquiera con el link
-- podía leer y escribir, sin necesidad de iniciar sesión) — una decisión
-- tomada a propósito mientras no había usuarios. Ahora que se agrega login,
-- se cierra esa puerta: todo requiere una sesión válida. Qué puede ver/
-- hacer cada quien dentro de eso ya lo controla la propia aplicación según
-- el rol (dueno/operadora) guardado en "perfiles".

drop policy if exists "acceso abierto contenedores" on contenedores;
create policy "requiere sesion contenedores" on contenedores
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "acceso abierto productos" on productos;
create policy "requiere sesion productos" on productos
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "acceso abierto pagos de mercancia" on pagos_mercancia;
create policy "requiere sesion pagos de mercancia" on pagos_mercancia
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "acceso abierto documentos contenedor" on documentos_contenedor;
create policy "requiere sesion documentos contenedor" on documentos_contenedor
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "acceso abierto historial estados" on historial_estados_contenedor;
create policy "requiere sesion historial estados" on historial_estados_contenedor
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "acceso abierto bodegas" on bodegas;
create policy "requiere sesion bodegas" on bodegas
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "acceso abierto movimientos stock" on movimientos_stock;
create policy "requiere sesion movimientos stock" on movimientos_stock
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "acceso abierto pendientes china" on pendientes_china;
create policy "requiere sesion pendientes china" on pendientes_china
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "acceso abierto configuracion stock" on configuracion_stock;
create policy "requiere sesion configuracion stock" on configuracion_stock
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "acceso abierto storage productos" on storage.objects;
create policy "requiere sesion storage productos" on storage.objects
  for all using (bucket_id = 'productos' and auth.uid() is not null)
  with check (bucket_id = 'productos' and auth.uid() is not null);

drop policy if exists "acceso abierto storage documentos" on storage.objects;
create policy "requiere sesion storage documentos" on storage.objects
  for all using (bucket_id = 'documentos' and auth.uid() is not null)
  with check (bucket_id = 'documentos' and auth.uid() is not null);

notify pgrst, 'reload schema';

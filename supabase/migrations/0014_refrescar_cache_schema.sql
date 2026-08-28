-- A veces PostgREST (la API que conecta la app con la base de datos) tarda
-- en darse cuenta de columnas que ya existen, sobre todo si se agregaron
-- hace poco (piezas_por_caja, de la migración 0010). Esto le dice
-- "vuelve a leer la estructura de la base de datos ahorita mismo".
notify pgrst, 'reload schema';

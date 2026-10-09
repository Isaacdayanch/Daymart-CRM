-- Envíos a Full en dos momentos (Isaac, 8 oct: "le ponemos que están en
-- camino y ya posteriormente que ya llegó; si no lo registramos hasta que
-- ya llegó, directamente le registramos que ya llegó").
--
--  1) Sale el envío  → se captura pegando la tabla del panel de ML y la
--     bodega se descuenta EN ESE MOMENTO con las piezas declaradas
--     (`salio_en` = fecha en que salió; `confirmado_en` = salida registrada).
--  2) Llega a Full   → "ML lo recibió completo" (un clic) o se pega la tabla
--     con "Aptas para Full"; cada diferencia se resuelve (se quedó en bodega
--     / merma) y el envío queda `cerrado_en`.

alter table mercadolibre_envios_full add column if not exists salio_en timestamptz;
alter table mercadolibre_envios_full add column if not exists cerrado_en timestamptz;

-- Cada línea sabe qué salida de bodega generó (para ajustarla al cerrar) y
-- qué se decidió con su diferencia: QUEDO_EN_BODEGA | MERMA.
alter table mercadolibre_envios_full_lineas add column if not exists salida_movimiento_id uuid;
alter table mercadolibre_envios_full_lineas add column if not exists salida_generada_en timestamptz;
alter table mercadolibre_envios_full_lineas add column if not exists diferencia_decision text;

-- Envíos que ya se habían confirmado con el flujo anterior (salida = lo que
-- ML recibió): quedan cerrados tal cual, sin tocar sus salidas.
update mercadolibre_envios_full
   set cerrado_en = confirmado_en,
       salio_en = coalesce(salio_en, fecha_recepcion, confirmado_en)
 where confirmado_en is not null and cerrado_en is null;

update mercadolibre_envios_full_lineas l
   set salida_generada_en = e.confirmado_en
  from mercadolibre_envios_full e
 where e.inbound_id = l.inbound_id
   and e.confirmado_en is not null
   and l.salida_generada_en is null;

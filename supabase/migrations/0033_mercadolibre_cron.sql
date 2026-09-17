-- Actualización automática de Mercado Libre (sin que Isaac haga nada).
-- `stock_cursor` guarda por dónde va una pasada de Stock que se hace en
-- varias llamadas cortas a /api/mercadolibre/cron (para no pasarse del
-- tiempo máximo de Vercel). El reloj que llama esa ruta se programa aparte
-- con pg_cron + pg_net (ver CLAUDE.md, "Actualización automática").
alter table mercadolibre_sync add column if not exists stock_cursor jsonb;

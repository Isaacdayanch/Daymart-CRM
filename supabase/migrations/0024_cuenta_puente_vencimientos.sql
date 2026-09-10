-- Tres piezas nuevas del flujo real de dinero que Isaac explicó a detalle:
--
-- 1. Cuentas "de tránsito" (ej. Mercado Pago): se usan para etiquetar de
--    dónde salió un gasto sin que cuenten como saldo real en el Balance
--    (Isaac no lleva un saldo de verdad ahí, solo quiere que el gasto se
--    vea en el global del negocio).
-- 2. Fecha límite POR CARGO de deuda con un proveedor (no una sola fecha
--    por proveedor) — Senado por ejemplo tiene varios cruces con
--    vencimientos distintos. Los abonos se aplican "el más viejo primero"
--    (FIFO) para saber qué cargo sigue abierto y avisar cuando se acerque
--    su fecha (src/lib/calculos-socios-deuda.ts).
-- 3. Pagos de mercancía (`pagos_mercancia`) ligados a una cuenta y su
--    movimiento real de Finanzas — hasta ahora un abono a un contenedor no
--    tocaba Finanzas para nada. Cuando el pago sale de una "cuenta puente"
--    (ej. Jaim T., el encargado financiero) con su propio tipo de cambio y
--    comisión por transacción, ahora sí queda todo conectado en una sola
--    captura.

alter table cuentas_financieras add column if not exists cuenta_transito boolean not null default false;

alter table movimientos_deuda_proveedor add column if not exists fecha_limite timestamptz;

alter table pagos_mercancia add column if not exists cuenta_id uuid references cuentas_financieras(id);
alter table pagos_mercancia add column if not exists movimiento_financiero_id uuid references movimientos_financieros(id) on delete set null;

insert into categorias_financieras (nombre, fija, orden)
values ('Gastos Mercado Libre (publicidad, almacenamiento, envíos)', false, 38)
on conflict (nombre) do nothing;

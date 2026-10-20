# Bitácora del Director Meli

Una entrada por día, la más nueva arriba. Qué se propuso, qué aprobó o rechazó Isaac, qué se ejecutó, reglas nuevas y pendientes.

> Desde el 20 oct la bitácora viva está en el CRM (`/director` → Bitácora, tabla `director_bitacora`). Este archivo solo guarda el arranque.

## 2026-10-20 (lun) — fase 1
- Isaac: "que el agente altere el CRM y el CRM altere Mercado Libre; así ya no necesitamos mi Chrome". Fase 1 construida: pantalla `/director` (propuestas, aprobar/rechazar con "No" + precio, "Ya la hice", historial, bitácora), puertas `POST /api/director/propuestas | decisiones | bitacora` y bloque `propuestas` en `GET /api/director`. Migración 0055.

## 2026-10-20 (lun)
- Se creó el Director: puerta de lectura del CRM (`/api/director`), manual, calendario, reglas y esta bitácora. Tarea programada diaria a las 8:25 am CDMX.
- Pendiente: Isaac pone la clave `DIRECTOR_SECRET` en Vercel y en el ambiente de Claude. Hasta entonces la rutina avisa que no puede leer el CRM.
